# R Plumber routes — full Chunk A + Chunk B.
#
# Layout:
#   §1 filters (cors, auth, error handler)
#   §2 /health
#   §3 /api/me
#   §4 Students CRUD + face enrollment
#   §5 Doctors CRUD + face enrollment
#   §6 Lectures CRUD
#   §7 /api/lectures/<id>/finalize (X-Finalize-Secret)
#   §8 /api/auth/face-login
#
# Helpers live in R/*.R and are sourced once on boot.

source("R/config.R",         local = FALSE)
source("R/gcp_oauth.R",      local = FALSE)
source("R/auth.R",           local = FALSE)
source("R/firestore.R",      local = FALSE)
source("R/firebase_auth.R",  local = FALSE)
source("R/face_ops.R",       local = FALSE)
source("R/cors.R",           local = FALSE)
source("R/helpers.R",        local = FALSE)
source("R/engagement.R",     local = FALSE)
source("R/brevo.R",          local = FALSE)
source("R/reports.R",        local = FALSE)

library(plumber)

# ============================================================
# §1 Filters & Global Setup
# ============================================================

#* @filter cors
function(req, res) {
  cat("[CORS] REQUEST -", req$REQUEST_METHOD, req$PATH, "\n")
  cors_filter(req, res)
}

#* @filter auth
function(req, res) auth_filter(req, res)

function(req, res) {
  res$setHeader("Access-Control-Allow-Origin", req$HTTP_ORIGIN %||% "*")
  res$setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
  res$setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")
  res$status <- 204
  list()
}

#* @plumber
function(pr) {
    # Mount OPTIONS handler
    pr$handle("OPTIONS", "/*", function(req, res, ...){
      cat("[OPTIONS] Handling OPTIONS for", req$PATH, "\n")
      origin <- req$HTTP_ORIGIN %||% "*"
      res$setHeader("Access-Control-Allow-Origin", origin)
      res$setHeader("Access-Control-Allow-Credentials", "true")
      res$setHeader("Access-Control-Allow-Headers", "Authorization,Content-Type,X-Finalize-Secret")
      res$setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS")
      res$status <- 204
      list()
    }, serializer = NULL)

  pr_set_error(pr, function(req, res, err) {
    if (inherits(err, "api_error")) {
      res$status <- err$status
      return(list(error = err$message))
    }
    res$status <- 500
    list(error = conditionMessage(err))
  })
}

# ============================================================
# §2 Health
# ============================================================

#* Simple liveness check — no auth required.
#* @get /health
function() {
  list(status = "ok",
       mode    = if (is_emulator()) "emulator" else "prod",
       project = fs_project())
}

# ============================================================
# §3 Current user
# ============================================================

#* @get /api/me
function(req) {
  require_auth(req)
  u <- req$user
  list(uid = u$uid, role = u$role, linked_id = u$linked_id, email = u$email)
}

# ============================================================
# §4 Students
# ============================================================

.students_visible_to <- function(user) {
  all <- fs_collection_df("students")
  if (nrow(all) == 0) return(all)
  active <- all[is.na(all$active) | all$active != FALSE, , drop = FALSE]
  switch(user$role %||% "",
    admin   = all,
    # Doctors need the active student roster to enroll students into new lectures.
    doctor  = active,
    student = active[active$id == user$linked_id, , drop = FALSE],
    parent  = {
      ids <- .parent_linked_student_ids(user$linked_id)
      active[active$id %in% ids, , drop = FALSE]
    },
    active[0, , drop = FALSE]
  )
}

# Helper: list of student_ids linked to a parent. Returns character(0) if missing.
.parent_linked_student_ids <- function(parent_id) {
  if (is.null(parent_id) || !nzchar(parent_id)) return(character(0))
  doc <- tryCatch(fs_get(sprintf("parents/%s", parent_id)), error = function(e) NULL)
  if (is.null(doc)) return(character(0))
  data <- fs_unwrap_fields(doc$fields)
  ids <- unlist(data$linked_student_ids %||% list())
  if (is.null(ids)) character(0) else as.character(ids)
}

# Helper: TRUE if the requester is allowed to view stats for student_id.
# Admin: yes. Student: only self. Doctor: only if the student is enrolled
# in one of their visible lectures. Parent: only if linked.
.can_view_student <- function(user, student_id) {
  role <- user$role %||% ""
  if (role == "admin") return(TRUE)
  if (role == "student") return(identical(user$linked_id, student_id))
  if (role == "parent") return(student_id %in% .parent_linked_student_ids(user$linked_id))
  if (role == "doctor") {
    lectures <- .lectures_visible_to(user)
    if (nrow(lectures) == 0) return(FALSE)
    enrolled_lists <- lapply(lectures$enrolled_student_ids, function(v) {
      if (is.null(v) || length(v) == 0) character(0) else unlist(v)
    })
    return(any(vapply(enrolled_lists, function(e) student_id %in% e, logical(1))))
  }
  FALSE
}

#* @get /api/students
function(req) { require_auth(req); .students_visible_to(req$user) }

#* Full student directory for admin/doctor search pages.
#* Query params:
#*   q: free-text query (matches id, student_id, name, email)
#*   include_inactive: true|false (default true)
#* @get /api/students/directory
function(req, q = "", include_inactive = "true") {
  require_auth(req)
  role <- req$user$role %||% ""
  if (!(role %in% c("admin", "doctor"))) {
    stop(api_error(403, "forbidden"))
  }

  all <- fs_collection_df("students")
  if (nrow(all) == 0) return(all)

  include_inactive <- tolower(as.character(include_inactive %||% "true")) %in% c("1", "true", "yes", "y")
  if (!include_inactive) {
    all <- all[is.na(all$active) | all$active != FALSE, , drop = FALSE]
  }

  q <- trimws(as.character(q %||% ""))
  if (!nzchar(q)) return(all)

  haystack <- paste(
    as.character(all$id %||% ""),
    as.character(all$student_id %||% ""),
    as.character(all$name %||% ""),
    as.character(all$email %||% ""),
    sep = " "
  )
  all[grepl(q, haystack, ignore.case = TRUE, perl = TRUE), , drop = FALSE]
}

#* @post /api/students
function(req, res) {
  require_admin(req)
  body <- jsonlite::fromJSON(req$postBody, simplifyVector = FALSE)
  if (is.null(body$email) || is.null(body$name)) {
    stop(api_error(400, "email and name are required"))
  }
  student_id <- body$student_id %||% new_id("stu")
  # Emulator (and real Firebase) both require a password. Generate one if the
  # admin didn't provide it — the response surfaces it so the admin can share
  # it with the new user (or they reset via email later).
  password <- body$password %||% paste0("tmp-", new_id(""))
  uid <- create_auth_user(email = body$email, password = password,
                          display_name = body$name)
  fs_create_at("students", student_id, drop_empty(list(
    student_id = student_id,
    name       = body$name,
    email      = body$email,
    active     = TRUE,
    created_at = now_iso()
  )))
  fs_create_at("users", uid, list(
    uid = uid, role = "student", linked_id = student_id, email = body$email
  ))
  out <- list(student_id = student_id, uid = uid)
  if (is.null(body$password)) out$temporary_password <- password
  out
}

#* @get /api/students/<id>
function(req, res, id) {
  require_auth(req)
  if (!.can_view_student(req$user, id)) stop(api_error(403, "forbidden"))
  doc <- tryCatch(fs_get(sprintf("students/%s", id)), error = function(e) NULL)
  if (is.null(doc)) stop(api_error(404, "student not found"))
  c(list(id = id), fs_unwrap_fields(doc$fields))
}

#* @put /api/students/<id>
function(req, res, id) {
  require_auth(req)
  if (req$user$role == "student") {
    if (!identical(req$user$linked_id, id)) {
      stop(api_error(403, "forbidden"))
    }
  } else {
    require_admin(req)
  }
  body <- jsonlite::fromJSON(req$postBody, simplifyVector = FALSE)
  allowed <- if (req$user$role == "student") c("name") else c("name", "email", "active")
  patch <- drop_empty(body[allowed])
  if (length(patch) == 0) stop(api_error(400, "nothing to update"))
  fs_update(sprintf("students/%s", id), patch)
  list(status = "updated", id = id)
}

#* @delete /api/students/<id>
function(req, res, id) {
  require_admin(req)
  fs_update(sprintf("students/%s", id),
            list(active = FALSE, deleted_at = now_iso()))
  list(status = "soft_deleted", id = id)
}

#* @post /api/students/<id>/face
#* @parser multi
function(req, res, id) {
  require_admin(req)
  up <- get_uploaded_file(req, "file")
  if (is.null(up)) stop(api_error(400, "multipart field 'file' is required"))
  image_path <- write_temp_image(up$bytes)
  encoding <- encode_face(image_path)
  fs_update(sprintf("students/%s", id),
            list(face_encoding = as.list(encoding),
                 face_enrolled_at = now_iso()))
  list(status = "enrolled", id = id, encoding_length = length(encoding))
}

# ============================================================
# §5 Doctors
# ============================================================

# ============================================================
# §4b Admins
# ============================================================

.admins_visible_to <- function(user) {
  all <- fs_collection_df("admins")
  if (nrow(all) == 0) return(all)
  active <- all[is.na(all$active) | all$active != FALSE, , drop = FALSE]
  if ((user$role %||% "") == "admin") return(active)
  active[0, , drop = FALSE]
}

#* @get /api/admins
function(req) { require_admin(req); .admins_visible_to(req$user) }

#* @post /api/admins
function(req, res) {
  require_admin(req)
  body <- jsonlite::fromJSON(req$postBody, simplifyVector = FALSE)
  if (is.null(body$email) || is.null(body$name)) {
    stop(api_error(400, "email and name are required"))
  }
  admin_id <- body$admin_id %||% new_id("adm")
  password <- body$password %||% paste0("tmp-", new_id(""))
  uid <- create_auth_user(email = body$email, password = password,
                          display_name = body$name)
  fs_create_at("admins", admin_id, drop_empty(list(
    admin_id   = admin_id,
    name       = body$name,
    email      = body$email,
    active     = TRUE,
    created_at = now_iso()
  )))
  fs_create_at("users", uid, list(
    uid = uid, role = "admin", linked_id = admin_id, email = body$email
  ))
  out <- list(admin_id = admin_id, uid = uid)
  if (is.null(body$password)) out$temporary_password <- password
  out
}

#* @get /api/admins/<id>
function(req, res, id) {
  require_admin(req)
  doc <- tryCatch(fs_get(sprintf("admins/%s", id)), error = function(e) NULL)
  if (is.null(doc)) stop(api_error(404, "admin not found"))
  c(list(id = id), fs_unwrap_fields(doc$fields))
}

#* @put /api/admins/<id>
function(req, res, id) {
  require_admin(req)
  body <- jsonlite::fromJSON(req$postBody, simplifyVector = FALSE)
  patch <- drop_empty(body[c("name", "email", "active")])
  if (length(patch) == 0) stop(api_error(400, "nothing to update"))
  if (identical(req$user$linked_id, id) && !is.null(patch$active) && identical(patch$active, FALSE)) {
    stop(api_error(400, "cannot deactivate your own admin account"))
  }
  fs_update(sprintf("admins/%s", id), patch)
  list(status = "updated", id = id)
}

#* @delete /api/admins/<id>
function(req, res, id) {
  require_admin(req)
  if (identical(req$user$linked_id, id)) {
    stop(api_error(400, "cannot delete your own admin account"))
  }
  fs_update(sprintf("admins/%s", id),
            list(active = FALSE, deleted_at = now_iso()))
  list(status = "soft_deleted", id = id)
}

# ============================================================
# §4c Parents
# ============================================================

.parents_visible_to <- function(user) {
  all <- fs_collection_df("parents")
  if (nrow(all) == 0) return(all)
  active <- all[is.na(all$active) | all$active != FALSE, , drop = FALSE]
  switch(user$role %||% "",
    admin  = all,
    parent = active[active$id == user$linked_id, , drop = FALSE],
    active[0, , drop = FALSE]
  )
}

#* @get /api/parents
function(req) { require_auth(req); .parents_visible_to(req$user) }

#* @post /api/parents
function(req, res) {
  require_admin(req)
  body <- jsonlite::fromJSON(req$postBody, simplifyVector = FALSE)
  if (is.null(body$email) || is.null(body$name)) {
    stop(api_error(400, "email and name are required"))
  }
  parent_id <- body$parent_id %||% new_id("par")
  password  <- body$password  %||% paste0("tmp-", new_id(""))
  linked    <- body$linked_student_ids %||% list()
  if (!is.list(linked)) linked <- as.list(linked)
  # Drop NULLs / NAs so each entry is a real string id.
  linked <- Filter(function(x) !is.null(x) && !(length(x) == 1 && is.na(x)) && nzchar(as.character(x)), linked)
  uid <- create_auth_user(email = body$email, password = password,
                          display_name = body$name)
  data <- list(
    parent_id    = parent_id,
    name         = body$name,
    email        = body$email,
    relationship = body$relationship,
    active       = TRUE,
    created_by   = req$user$uid,
    created_at   = now_iso()
  )
  data <- drop_empty(data)
  # Always include linked_student_ids — even empty — but as an explicit list
  # so fs_encode emits a proper Firestore arrayValue.
  data$linked_student_ids <- linked
  fs_create_at("parents", parent_id, data)
  fs_create_at("users", uid, list(
    uid = uid, role = "parent", linked_id = parent_id, email = body$email
  ))
  out <- list(parent_id = parent_id, uid = uid)
  if (is.null(body$password)) out$temporary_password <- password
  out
}

#* @get /api/parents/<id>
function(req, res, id) {
  require_auth(req)
  if (req$user$role == "parent" && !identical(req$user$linked_id, id)) {
    stop(api_error(403, "forbidden"))
  } else if (!(req$user$role %in% c("admin", "parent"))) {
    stop(api_error(403, "forbidden"))
  }
  doc <- tryCatch(fs_get(sprintf("parents/%s", id)), error = function(e) NULL)
  if (is.null(doc)) stop(api_error(404, "parent not found"))
  c(list(id = id), fs_unwrap_fields(doc$fields))
}

#* @put /api/parents/<id>
function(req, res, id) {
  require_admin(req)
  body <- jsonlite::fromJSON(req$postBody, simplifyVector = FALSE)
  # Pull linked_student_ids out separately so an empty list ([]) isn't dropped
  # by drop_empty.
  has_linked <- "linked_student_ids" %in% names(body)
  patch <- drop_empty(body[c("name", "email", "relationship", "active")])
  if (has_linked) {
    linked <- body$linked_student_ids %||% list()
    if (!is.list(linked)) linked <- as.list(linked)
    linked <- Filter(function(x) !is.null(x) && !(length(x) == 1 && is.na(x)) && nzchar(as.character(x)), linked)
    patch$linked_student_ids <- linked
  }
  if (length(patch) == 0) stop(api_error(400, "nothing to update"))
  fs_update(sprintf("parents/%s", id), patch)
  list(status = "updated", id = id)
}

#* @delete /api/parents/<id>
function(req, res, id) {
  require_admin(req)
  fs_update(sprintf("parents/%s", id),
            list(active = FALSE, deleted_at = now_iso()))
  list(status = "soft_deleted", id = id)
}

# ============================================================
# §5 Doctors
# ============================================================

.doctors_visible_to <- function(user) {
  all <- fs_collection_df("doctors")
  if (nrow(all) == 0) return(all)
  active <- all[is.na(all$active) | all$active != FALSE, , drop = FALSE]
  switch(user$role %||% "",
    admin   = active,
    doctor  = active[active$id == user$linked_id,
                     intersect(c("id","name"), colnames(active)), drop = FALSE],
    student = {
      lectures <- fs_collection_df("lectures")
      my_doctor_ids <- if (nrow(lectures) == 0) character(0) else {
        enrolled_lists <- lapply(lectures$enrolled_student_ids, function(v) {
          if (is.null(v) || length(v) == 0) character(0) else unlist(v)
        })
        unique(lectures$doctor_id[vapply(enrolled_lists,
                                         function(e) user$linked_id %in% e, logical(1))])
      }
      active[active$id %in% my_doctor_ids,
             intersect(c("id","name"), colnames(active)), drop = FALSE]
    },
    active[0, , drop = FALSE]
  )
}

#* @get /api/doctors
function(req) { require_auth(req); .doctors_visible_to(req$user) }

#* Full doctor directory search endpoint.
#* Query params:
#*   q: free-text query (matches id, doctor_id, name, department, email)
#*   include_inactive: true|false (default false)
#* @get /api/doctors/directory
function(req, q = "", include_inactive = "false") {
  require_auth(req)
  role <- req$user$role %||% ""
  if (!(role %in% c("admin", "doctor", "student"))) {
    stop(api_error(403, "forbidden"))
  }

  all <- fs_collection_df("doctors")
  if (nrow(all) == 0) return(all)

  include_inactive <- tolower(as.character(include_inactive %||% "false")) %in% c("1", "true", "yes", "y")
  if (!include_inactive) {
    all <- all[is.na(all$active) | all$active != FALSE, , drop = FALSE]
  }

  q <- trimws(as.character(q %||% ""))
  if (!nzchar(q)) return(all)

  haystack <- paste(
    as.character(all$id %||% ""),
    as.character(all$doctor_id %||% ""),
    as.character(all$name %||% ""),
    as.character(all$department %||% ""),
    as.character(all$email %||% ""),
    sep = " "
  )
  all[grepl(q, haystack, ignore.case = TRUE, perl = TRUE), , drop = FALSE]
}

#* @post /api/doctors
function(req, res) {
  require_admin(req)
  body <- jsonlite::fromJSON(req$postBody, simplifyVector = FALSE)
  if (is.null(body$email) || is.null(body$name)) {
    stop(api_error(400, "email and name are required"))
  }
  doctor_id <- body$doctor_id %||% new_id("doc")
  # Emulator (and real Firebase) both require a password. Generate one if the
  # admin didn't provide it — the response surfaces it so the admin can share
  # it with the new user (or they reset via email later).
  password <- body$password %||% paste0("tmp-", new_id(""))
  uid <- create_auth_user(email = body$email, password = password,
                          display_name = body$name)
  fs_create_at("doctors", doctor_id, drop_empty(list(
    doctor_id  = doctor_id,
    name       = body$name,
    email      = body$email,
    department = body$department,
    active     = TRUE,
    created_at = now_iso()
  )))
  fs_create_at("users", uid, list(
    uid = uid, role = "doctor", linked_id = doctor_id, email = body$email
  ))
  out <- list(doctor_id = doctor_id, uid = uid)
  if (is.null(body$password)) out$temporary_password <- password
  out
}

#* @get /api/doctors/<id>
function(req, res, id) {
  require_admin(req)
  doc <- tryCatch(fs_get(sprintf("doctors/%s", id)), error = function(e) NULL)
  if (is.null(doc)) stop(api_error(404, "doctor not found"))
  c(list(id = id), fs_unwrap_fields(doc$fields))
}

#* @put /api/doctors/<id>
function(req, res, id) {
  require_admin(req)
  body <- jsonlite::fromJSON(req$postBody, simplifyVector = FALSE)
  patch <- drop_empty(body[c("name", "email", "department", "active")])
  if (length(patch) == 0) stop(api_error(400, "nothing to update"))
  fs_update(sprintf("doctors/%s", id), patch)
  list(status = "updated", id = id)
}

#* @delete /api/doctors/<id>
function(req, res, id) {
  require_admin(req)
  fs_update(sprintf("doctors/%s", id),
            list(active = FALSE, deleted_at = now_iso()))
  list(status = "soft_deleted", id = id)
}

#* @post /api/doctors/<id>/face
#* @parser multi
function(req, res, id) {
  require_admin(req)
  up <- get_uploaded_file(req, "file")
  if (is.null(up)) stop(api_error(400, "multipart field 'file' is required"))
  image_path <- write_temp_image(up$bytes)
  encoding <- encode_face(image_path)
  fs_update(sprintf("doctors/%s", id),
            list(face_encoding = as.list(encoding),
                 face_enrolled_at = now_iso()))
  list(status = "enrolled", id = id, encoding_length = length(encoding))
}

# ============================================================
# §5a Subjects
# ============================================================

.subjects_visible_to <- function(user) {
  all <- fs_collection_df("subjects")
  if (nrow(all) == 0) return(all)
  active <- all[is.na(all$active) | all$active != FALSE, , drop = FALSE]
  switch(user$role %||% "",
    admin   = active,
    doctor  = active[active$doctor_id == user$linked_id, , drop = FALSE],
    student = active[0, , drop = FALSE],  # students cannot see subjects directly
    active[0, , drop = FALSE]
  )
}

#* @get /api/subjects
function(req) { require_auth(req); .subjects_visible_to(req$user) }

#* @post /api/subjects
function(req, res) {
  require_admin(req)
  body <- jsonlite::fromJSON(req$postBody, simplifyVector = FALSE)
  if (is.null(body$doctor_id) || is.null(body$name)) {
    stop(api_error(400, "doctor_id and name are required"))
  }
  subject_id <- body$subject_id %||% new_id("sub")
  fs_create_at("subjects", subject_id, drop_empty(list(
    subject_id  = subject_id,
    doctor_id   = body$doctor_id,
    name        = body$name,
    code        = body$code,
    description = body$description,
    active      = TRUE,
    created_by  = req$user$uid,
    created_at  = now_iso()
  )))
  list(subject_id = subject_id)
}

#* @get /api/subjects/<id>
function(req, res, id) {
  require_auth(req)
  doc <- tryCatch(fs_get(sprintf("subjects/%s", id)), error = function(e) NULL)
  if (is.null(doc)) stop(api_error(404, "subject not found"))
  data <- fs_unwrap_fields(doc$fields)
  if (req$user$role == "doctor" && !identical(data$doctor_id, req$user$linked_id))
    stop(api_error(403, "forbidden"))
  c(list(id = id), data)
}

#* @put /api/subjects/<id>
function(req, res, id) {
  require_admin(req)
  body <- jsonlite::fromJSON(req$postBody, simplifyVector = FALSE)
  patch <- drop_empty(body[c("doctor_id", "name", "code", "description", "active")])
  if (length(patch) == 0) stop(api_error(400, "nothing to update"))
  fs_update(sprintf("subjects/%s", id), patch)
  list(status = "updated", id = id)
}

#* @delete /api/subjects/<id>
function(req, res, id) {
  require_admin(req)
  fs_update(sprintf("subjects/%s", id),
            list(active = FALSE, deleted_at = now_iso()))
  list(status = "soft_deleted", id = id)
}

# ============================================================
# §5b Classes
# ============================================================

.classes_visible_to <- function(user) {
  all <- fs_collection_df("classes")
  if (nrow(all) == 0) return(all)
  active <- all[is.na(all$active) | all$active != FALSE, , drop = FALSE]
  switch(user$role %||% "",
    admin   = active,
    doctor  = {
      # Doctors see classes in their assigned subjects
      subjects <- fs_collection_df("subjects")
      my_subjects <- if (nrow(subjects) > 0) {
        subjects[subjects$doctor_id == user$linked_id, "id", drop = TRUE]
      } else character(0)
      active[active$subject_id %in% my_subjects, , drop = FALSE]
    },
    student = {
      # Students see classes they are enrolled in
      active[vapply(active$enrolled_student_ids, function(v) {
        user$linked_id %in% unlist(v %||% list())
      }, logical(1)), , drop = FALSE]
    },
    parent = {
      kids <- .parent_linked_student_ids(user$linked_id)
      direct <- vapply(active$enrolled_student_ids, function(v) {
        any(kids %in% unlist(v %||% list()))
      }, logical(1))
      # Also include classes reached transitively: lecture -> week -> class
      via_lec <- .parent_class_ids_via_lectures(kids)
      active[direct | active$id %in% via_lec, , drop = FALSE]
    },
    active[0, , drop = FALSE]
  )
}

# Helper: class ids reachable from any lecture a kid is enrolled in.
.parent_class_ids_via_lectures <- function(kids) {
  if (length(kids) == 0) return(character(0))
  lectures <- fs_collection_df("lectures")
  if (nrow(lectures) == 0) return(character(0))
  enrolled <- vapply(lectures$enrolled_student_ids, function(v) {
    any(kids %in% unlist(v %||% list()))
  }, logical(1))
  if (!any(enrolled)) return(character(0))
  week_ids <- unique(lectures$week_id[enrolled])
  week_ids <- week_ids[!is.na(week_ids) & nzchar(as.character(week_ids))]
  if (length(week_ids) == 0) return(character(0))
  weeks <- fs_collection_df("weeks")
  if (nrow(weeks) == 0) return(character(0))
  unique(weeks$class_id[weeks$id %in% week_ids])
}

#* @get /api/classes
function(req) { require_auth(req); .classes_visible_to(req$user) }

#* @post /api/classes
function(req, res) {
  require_admin_or_doctor(req)
  body <- jsonlite::fromJSON(req$postBody, simplifyVector = FALSE)
  if (is.null(body$subject_id) || is.null(body$name)) {
    stop(api_error(400, "subject_id and name are required"))
  }
  # Verify that doctor is assigned to this subject
  if (req$user$role == "doctor") {
    subject_doc <- tryCatch(fs_get(sprintf("subjects/%s", body$subject_id)),
                           error = function(e) NULL)
    if (is.null(subject_doc)) stop(api_error(404, "subject not found"))
    subject_data <- fs_unwrap_fields(subject_doc$fields)
    if (!identical(subject_data$doctor_id, req$user$linked_id)) {
      stop(api_error(403, "not assigned to this subject"))
    }
  }
  class_id <- body$class_id %||% new_id("cls")
  fs_create_at("classes", class_id, drop_empty(list(
    class_id           = class_id,
    subject_id         = body$subject_id,
    name               = body$name,
    section            = body$section,
    academic_year      = body$academic_year,
    term               = body$term,
    enrolled_student_ids = body$enrolled_student_ids %||% list(),
    active             = TRUE,
    created_by         = req$user$uid,
    created_at         = now_iso()
  )))
  list(class_id = class_id)
}

#* @get /api/classes/<id>
function(req, res, id) {
  require_auth(req)
  doc <- tryCatch(fs_get(sprintf("classes/%s", id)), error = function(e) NULL)
  if (is.null(doc)) stop(api_error(404, "class not found"))
  data <- fs_unwrap_fields(doc$fields)
  u <- req$user
  if (u$role == "doctor") {
    subject_doc <- tryCatch(fs_get(sprintf("subjects/%s", data$subject_id)),
                           error = function(e) NULL)
    if (is.null(subject_doc)) stop(api_error(404, "subject not found"))
    subject_data <- fs_unwrap_fields(subject_doc$fields)
    if (!identical(subject_data$doctor_id, u$linked_id)) {
      stop(api_error(403, "forbidden"))
    }
  } else if (u$role == "student") {
    if (!(u$linked_id %in% unlist(data$enrolled_student_ids %||% list()))) {
      stop(api_error(403, "not enrolled"))
    }
  } else if (u$role == "parent") {
    kids <- .parent_linked_student_ids(u$linked_id)
    if (!any(kids %in% unlist(data$enrolled_student_ids %||% list()))) {
      stop(api_error(403, "no linked student in class"))
    }
  }
  c(list(id = id), data)
}

#* @put /api/classes/<id>
function(req, res, id) {
  require_admin_or_doctor(req)
  doc <- tryCatch(fs_get(sprintf("classes/%s", id)), error = function(e) NULL)
  if (is.null(doc)) stop(api_error(404, "class not found"))
  data <- fs_unwrap_fields(doc$fields)
  if (req$user$role == "doctor") {
    subject_doc <- tryCatch(fs_get(sprintf("subjects/%s", data$subject_id)),
                           error = function(e) NULL)
    if (is.null(subject_doc)) stop(api_error(404, "subject not found"))
    subject_data <- fs_unwrap_fields(subject_doc$fields)
    if (!identical(subject_data$doctor_id, req$user$linked_id)) {
      stop(api_error(403, "forbidden"))
    }
  }
  body <- jsonlite::fromJSON(req$postBody, simplifyVector = FALSE)
  patch <- drop_empty(body[c("subject_id", "name", "section", "academic_year", "term", "enrolled_student_ids", "active")])
  if (length(patch) == 0) stop(api_error(400, "nothing to update"))
  fs_update(sprintf("classes/%s", id), patch)
  list(status = "updated", id = id)
}

#* @delete /api/classes/<id>
function(req, res, id) {
  require_admin_or_doctor(req)
  doc <- tryCatch(fs_get(sprintf("classes/%s", id)), error = function(e) NULL)
  if (is.null(doc)) stop(api_error(404, "class not found"))
  data <- fs_unwrap_fields(doc$fields)
  if (req$user$role == "doctor") {
    subject_doc <- tryCatch(fs_get(sprintf("subjects/%s", data$subject_id)),
                           error = function(e) NULL)
    if (is.null(subject_doc)) stop(api_error(404, "subject not found"))
    subject_data <- fs_unwrap_fields(subject_doc$fields)
    if (!identical(subject_data$doctor_id, req$user$linked_id)) {
      stop(api_error(403, "forbidden"))
    }
  }
  fs_update(sprintf("classes/%s", id),
            list(active = FALSE, deleted_at = now_iso()))
  list(status = "soft_deleted", id = id)
}

# ============================================================
# §5c Weeks
# ============================================================

.weeks_visible_to <- function(user) {
  all <- fs_collection_df("weeks")
  if (nrow(all) == 0) return(all)
  active <- all[is.na(all$active) | all$active != FALSE, , drop = FALSE]
  switch(user$role %||% "",
    admin   = active,
    doctor  = {
      # Doctors see weeks in their assigned classes
      classes <- .classes_visible_to(user)
      my_classes <- if (nrow(classes) > 0) classes$id else character(0)
      active[active$class_id %in% my_classes, , drop = FALSE]
    },
    student = {
      # Students see weeks for classes they are enrolled in
      classes <- .classes_visible_to(user)
      my_classes <- if (nrow(classes) > 0) classes$id else character(0)
      active[active$class_id %in% my_classes, , drop = FALSE]
    },
    parent = {
      # Parents see weeks for classes reachable through their kids' lectures.
      classes <- .classes_visible_to(user)
      my_classes <- if (nrow(classes) > 0) classes$id else character(0)
      active[active$class_id %in% my_classes, , drop = FALSE]
    },
    active[0, , drop = FALSE]
  )
}

#* @get /api/weeks
function(req) { require_auth(req); .weeks_visible_to(req$user) }

#* @post /api/weeks
function(req, res) {
  require_admin_or_doctor(req)
  body <- jsonlite::fromJSON(req$postBody, simplifyVector = FALSE)
  if (is.null(body$class_id)) {
    stop(api_error(400, "class_id is required"))
  }
  # Verify that user can access this class
  class_doc <- tryCatch(fs_get(sprintf("classes/%s", body$class_id)),
                       error = function(e) NULL)
  if (is.null(class_doc)) stop(api_error(404, "class not found"))
  class_data <- fs_unwrap_fields(class_doc$fields)
  if (req$user$role == "doctor") {
    subject_doc <- tryCatch(fs_get(sprintf("subjects/%s", class_data$subject_id)),
                           error = function(e) NULL)
    if (is.null(subject_doc)) stop(api_error(404, "subject not found"))
    subject_data <- fs_unwrap_fields(subject_doc$fields)
    if (!identical(subject_data$doctor_id, req$user$linked_id)) {
      stop(api_error(403, "forbidden"))
    }
  }
  week_id <- body$week_id %||% new_id("wk")
  fs_create_at("weeks", week_id, drop_empty(list(
    week_id    = week_id,
    class_id   = body$class_id,
    week_number = body$week_number %||% 1,
    title      = body$title,
    date       = body$date,
    lecture_id = body$lecture_id,
    status     = body$status %||% "planned",
    notes      = body$notes,
    active     = TRUE,
    created_by = req$user$uid,
    created_at = now_iso()
  )))
  list(week_id = week_id)
}

#* @get /api/weeks/<id>
function(req, res, id) {
  require_auth(req)
  doc <- tryCatch(fs_get(sprintf("weeks/%s", id)), error = function(e) NULL)
  if (is.null(doc)) stop(api_error(404, "week not found"))
  data <- fs_unwrap_fields(doc$fields)
  u <- req$user
  if (u$role == "doctor") {
    class_doc <- tryCatch(fs_get(sprintf("classes/%s", data$class_id)),
                         error = function(e) NULL)
    if (is.null(class_doc)) stop(api_error(404, "class not found"))
    class_data <- fs_unwrap_fields(class_doc$fields)
    subject_doc <- tryCatch(fs_get(sprintf("subjects/%s", class_data$subject_id)),
                           error = function(e) NULL)
    if (is.null(subject_doc)) stop(api_error(404, "subject not found"))
    subject_data <- fs_unwrap_fields(subject_doc$fields)
    if (!identical(subject_data$doctor_id, u$linked_id)) {
      stop(api_error(403, "forbidden"))
    }
  } else if (u$role == "student") {
    class_doc <- tryCatch(fs_get(sprintf("classes/%s", data$class_id)),
                         error = function(e) NULL)
    if (is.null(class_doc)) stop(api_error(404, "class not found"))
    class_data <- fs_unwrap_fields(class_doc$fields)
    if (!(u$linked_id %in% unlist(class_data$enrolled_student_ids %||% list()))) {
      stop(api_error(403, "not enrolled"))
    }
  }
  c(list(id = id), data)
}

#* @put /api/weeks/<id>
function(req, res, id) {
  require_admin_or_doctor(req)
  doc <- tryCatch(fs_get(sprintf("weeks/%s", id)), error = function(e) NULL)
  if (is.null(doc)) stop(api_error(404, "week not found"))
  data <- fs_unwrap_fields(doc$fields)
  if (req$user$role == "doctor") {
    class_doc <- tryCatch(fs_get(sprintf("classes/%s", data$class_id)),
                         error = function(e) NULL)
    if (is.null(class_doc)) stop(api_error(404, "class not found"))
    class_data <- fs_unwrap_fields(class_doc$fields)
    subject_doc <- tryCatch(fs_get(sprintf("subjects/%s", class_data$subject_id)),
                           error = function(e) NULL)
    if (is.null(subject_doc)) stop(api_error(404, "subject not found"))
    subject_data <- fs_unwrap_fields(subject_doc$fields)
    if (!identical(subject_data$doctor_id, req$user$linked_id)) {
      stop(api_error(403, "forbidden"))
    }
  }
  body <- jsonlite::fromJSON(req$postBody, simplifyVector = FALSE)
  patch <- drop_empty(body[c("class_id", "week_number", "title", "date", "lecture_id", "status", "notes", "active")])
  if (length(patch) == 0) stop(api_error(400, "nothing to update"))
  fs_update(sprintf("weeks/%s", id), patch)
  list(status = "updated", id = id)
}

#* @delete /api/weeks/<id>
function(req, res, id) {
  require_admin_or_doctor(req)
  doc <- tryCatch(fs_get(sprintf("weeks/%s", id)), error = function(e) NULL)
  if (is.null(doc)) stop(api_error(404, "week not found"))
  data <- fs_unwrap_fields(doc$fields)
  if (req$user$role == "doctor") {
    class_doc <- tryCatch(fs_get(sprintf("classes/%s", data$class_id)),
                         error = function(e) NULL)
    if (is.null(class_doc)) stop(api_error(404, "class not found"))
    class_data <- fs_unwrap_fields(class_doc$fields)
    subject_doc <- tryCatch(fs_get(sprintf("subjects/%s", class_data$subject_id)),
                           error = function(e) NULL)
    if (is.null(subject_doc)) stop(api_error(404, "subject not found"))
    subject_data <- fs_unwrap_fields(subject_doc$fields)
    if (!identical(subject_data$doctor_id, req$user$linked_id)) {
      stop(api_error(403, "forbidden"))
    }
  }
  fs_update(sprintf("weeks/%s", id),
            list(active = FALSE, deleted_at = now_iso()))
  list(status = "soft_deleted", id = id)
}

# ============================================================
# §6 Lectures
# ============================================================

.lectures_visible_to <- function(user) {
  all <- fs_collection_df("lectures")
  if (nrow(all) == 0) return(all)
  switch(user$role %||% "",
    admin   = all,
    doctor  = all[all$doctor_id %in% user$linked_id, , drop = FALSE],
    student = {
      enrolled <- vapply(all$enrolled_student_ids, function(v) {
        if (is.null(v) || length(v) == 0) FALSE
        else user$linked_id %in% unlist(v)
      }, logical(1))
      all[enrolled, , drop = FALSE]
    },
    parent = {
      kids <- .parent_linked_student_ids(user$linked_id)
      direct <- vapply(all$enrolled_student_ids, function(v) {
        if (is.null(v) || length(v) == 0) FALSE
        else any(kids %in% unlist(v))
      }, logical(1))
      # Transitive: lectures whose week belongs to a class with any kid enrolled.
      via_class <- rep(FALSE, nrow(all))
      classes_df <- fs_collection_df("classes")
      weeks_df   <- fs_collection_df("weeks")
      if (nrow(classes_df) > 0 && nrow(weeks_df) > 0) {
        kid_class_ids <- classes_df$id[vapply(classes_df$enrolled_student_ids, function(v) {
          if (is.null(v) || length(v) == 0) FALSE else any(kids %in% unlist(v))
        }, logical(1))]
        kid_week_ids <- weeks_df$id[weeks_df$class_id %in% kid_class_ids]
        via_class <- all$week_id %in% kid_week_ids
      }
      all[direct | via_class, , drop = FALSE]
    },
    all[0, , drop = FALSE]
  )
}

#* @get /api/lectures
function(req) { require_auth(req); .lectures_visible_to(req$user) }

#* @post /api/lectures
function(req, res) {
  require_admin_or_doctor(req)
  body <- jsonlite::fromJSON(req$postBody, simplifyVector = FALSE)
  if (is.null(body$title)) stop(api_error(400, "title is required"))
  if (is.null(body$week_id)) stop(api_error(400, "week_id is required"))
  doctor_id <- if (req$user$role == "admin") body$doctor_id else req$user$linked_id
  if (is.null(doctor_id)) stop(api_error(400, "doctor_id is required"))
  week_doc <- tryCatch(fs_get(sprintf("weeks/%s", body$week_id)), error = function(e) NULL)
  if (is.null(week_doc)) stop(api_error(404, "week not found"))
  week_data <- fs_unwrap_fields(week_doc$fields)
  class_doc <- tryCatch(fs_get(sprintf("classes/%s", week_data$class_id)), error = function(e) NULL)
  if (is.null(class_doc)) stop(api_error(404, "class not found"))
  class_data <- fs_unwrap_fields(class_doc$fields)
  subject_doc <- tryCatch(fs_get(sprintf("subjects/%s", class_data$subject_id)), error = function(e) NULL)
  if (is.null(subject_doc)) stop(api_error(404, "subject not found"))
  subject_data <- fs_unwrap_fields(subject_doc$fields)
  if (req$user$role == "doctor" && !identical(subject_data$doctor_id, req$user$linked_id)) {
    stop(api_error(403, "forbidden"))
  }
  lecture_id <- body$lecture_id %||% new_id("lec")
  fs_create_at("lectures", lecture_id, drop_empty(list(
    lecture_id           = lecture_id,
    title                = body$title,
    doctor_id            = doctor_id,
    week_id              = body$week_id,
    status               = body$status %||% "scheduled",
    enrolled_student_ids = body$enrolled_student_ids %||% list(),
    scheduled_at         = body$scheduled_at,
    created_at           = now_iso()
  )))
  fs_update(sprintf("weeks/%s", body$week_id), list(lecture_id = lecture_id))
  list(lecture_id = lecture_id)
}

#* @get /api/lectures/<id>
function(req, res, id) {
  require_auth(req)
  doc <- tryCatch(fs_get(sprintf("lectures/%s", id)), error = function(e) NULL)
  if (is.null(doc)) stop(api_error(404, "lecture not found"))
  data <- fs_unwrap_fields(doc$fields)
  u <- req$user
  if (u$role == "doctor"  && !identical(data$doctor_id, u$linked_id))
    stop(api_error(403, "not your lecture"))
  if (u$role == "student" && !(u$linked_id %in% unlist(data$enrolled_student_ids %||% list())))
    stop(api_error(403, "not enrolled"))
  if (u$role == "parent") {
    kids <- .parent_linked_student_ids(u$linked_id)
    if (!any(kids %in% unlist(data$enrolled_student_ids %||% list())))
      stop(api_error(403, "no linked student in lecture"))
  }
  c(list(id = id), data)
}

#* @put /api/lectures/<id>
function(req, res, id) {
  require_auth(req)
  u <- req$user
  doc <- tryCatch(fs_get(sprintf("lectures/%s", id)), error = function(e) NULL)
  if (is.null(doc)) stop(api_error(404, "lecture not found"))
  data <- fs_unwrap_fields(doc$fields)
  old_week_id <- data$week_id %||% NULL
  if (u$role == "doctor" && !identical(data$doctor_id, u$linked_id))
    stop(api_error(403, "not your lecture"))
  if (u$role == "student") stop(api_error(403, "forbidden"))
  body <- jsonlite::fromJSON(req$postBody, simplifyVector = FALSE)
  allowed <- c("title", "status", "enrolled_student_ids", "scheduled_at", "week_id")
  if (u$role == "admin") allowed <- c(allowed, "doctor_id")
  patch <- drop_empty(body[allowed])
  if (length(patch) == 0) stop(api_error(400, "nothing to update"))
  new_week_id <- patch$week_id %||% old_week_id
  if (!identical(new_week_id, old_week_id)) {
    new_week_doc <- tryCatch(fs_get(sprintf("weeks/%s", new_week_id)), error = function(e) NULL)
    if (is.null(new_week_doc)) stop(api_error(404, "week not found"))
    new_week_data <- fs_unwrap_fields(new_week_doc$fields)
    new_class_doc <- tryCatch(fs_get(sprintf("classes/%s", new_week_data$class_id)), error = function(e) NULL)
    if (is.null(new_class_doc)) stop(api_error(404, "class not found"))
    new_class_data <- fs_unwrap_fields(new_class_doc$fields)
    new_subject_doc <- tryCatch(fs_get(sprintf("subjects/%s", new_class_data$subject_id)), error = function(e) NULL)
    if (is.null(new_subject_doc)) stop(api_error(404, "subject not found"))
    new_subject_data <- fs_unwrap_fields(new_subject_doc$fields)
    if (u$role == "doctor" && !identical(new_subject_data$doctor_id, u$linked_id)) {
      stop(api_error(403, "forbidden"))
    }
    if (!is.null(old_week_id)) {
      fs_update(sprintf("weeks/%s", old_week_id), list(lecture_id = NULL))
    }
    fs_update(sprintf("weeks/%s", new_week_id), list(lecture_id = id))
  }
  fs_update(sprintf("lectures/%s", id), patch)
  list(status = "updated", id = id)
}

#* @delete /api/lectures/<id>
function(req, res, id) {
  require_auth(req)
  u <- req$user
  doc <- tryCatch(fs_get(sprintf("lectures/%s", id)), error = function(e) NULL)
  if (is.null(doc)) stop(api_error(404, "lecture not found"))
  data <- fs_unwrap_fields(doc$fields)
  if (u$role == "doctor" && !identical(data$doctor_id, u$linked_id))
    stop(api_error(403, "not your lecture"))
  if (u$role == "student") stop(api_error(403, "forbidden"))
  if (!is.null(data$week_id)) {
    fs_update(sprintf("weeks/%s", data$week_id), list(lecture_id = NULL))
  }
  fs_delete(sprintf("lectures/%s", id))
  list(status = "deleted", id = id)
}

# ============================================================
# §7 /api/lectures/<id>/finalize — called by the Python classroom app
# ============================================================

#* @post /api/lectures/<id>/finalize
function(req, res, id) {
  provided <- req$HTTP_X_FINALIZE_SECRET %||% ""
  expected <- require_env("FINALIZE_SHARED_SECRET")
  if (!identical(provided, expected)) {
    stop(api_error(401, "invalid or missing X-Finalize-Secret header"))
  }
  fs_update(sprintf("lectures/%s", id),
            list(status = "finished", finalized_at = now_iso()))
  # Render the report synchronously. For the emulator/dev path it's ~1–2s.
  # If rendering fails (tinytex missing, Rmd error), log and continue — the
  # capture app's quit shouldn't hang on report errors.
  report_status <- tryCatch({ render_lecture_report(id); "generated" },
                            error = function(e) {
                              message("[finalize] report render failed: ",
                                      conditionMessage(e))
                              "failed"
                            })
  list(status = "finalized", report = report_status)
}

# ============================================================
# §8 Face sign-in — student + doctor only
# ============================================================

.read_multipart_text <- function(body, field) {
  v <- body[[field]]
  if (is.null(v)) return(NULL)
  if (is.list(v)) v <- v$value
  if (is.raw(v))  v <- rawToChar(v)
  v
}

#* @post /api/auth/face-login
#* @parser multi
function(req, res) {
  role <- .read_multipart_text(req$body %||% list(), "role") %||% "student"
  if (identical(role, "admin")) {
    stop(api_error(403, "face sign-in is disabled for admins"))
  }
  if (!(role %in% c("student", "doctor"))) {
    stop(api_error(400, "role must be 'student' or 'doctor'"))
  }

  up <- get_uploaded_file(req, "file")
  if (is.null(up)) stop(api_error(400, "multipart field 'file' is required"))
  image_path <- write_temp_image(up$bytes)
  on.exit(unlink(image_path), add = TRUE)

  collection <- if (role == "student") "students" else "doctors"
  df <- fs_collection_df(collection)
  if (nrow(df) == 0 || is.null(df$face_encoding)) stop(api_error(401, "no_match"))
  df <- df[is.na(df$active) | df$active != FALSE, , drop = FALSE]

  candidates <- Filter(Negate(is.null), lapply(seq_len(nrow(df)), function(i) {
    enc <- df$face_encoding[[i]]
    if (is.null(enc) || length(enc) == 0) return(NULL)
    list(user_id = df$id[i], encoding = unlist(enc))
  }))
  if (length(candidates) == 0) stop(api_error(401, "no_match"))

  result <- match_face(image_path, candidates)
  if (!is.null(result$error)) {
    res$status <- 401
    return(list(error = "no_match", best_distance = result$best_distance))
  }

  users_df <- fs_collection_df("users")
  hit <- users_df[users_df$role == role & users_df$linked_id == result$user_id, , drop = FALSE]
  if (nrow(hit) == 0) stop(api_error(500, "match succeeded but no users/<uid> doc found"))
  uid <- hit$uid[1]

  token <- mint_custom_token(uid, claims = list(role = role))
  list(custom_token = token, role = role, linked_id = result$user_id,
       distance = result$distance)
}

# ============================================================
# §9 Analytics — read emotions + aggregate, scoped by role
# ============================================================

# Helper: return the emotions tibble for the lectures the caller can see.
.emotions_for_user <- function(user, lecture_id = NULL, student_id = NULL) {
  visible_lectures <- .lectures_visible_to(user)
  if (nrow(visible_lectures) == 0) return(data.frame())
  visible_ids <- visible_lectures$id
  if (!is.null(lecture_id)) {
    if (!(lecture_id %in% visible_ids)) stop(api_error(403, "not your lecture"))
    visible_ids <- lecture_id
  }

  all_emotions <- fs_collection_df("emotions")
  if (nrow(all_emotions) == 0) return(all_emotions)

  df <- all_emotions[all_emotions$lecture_id %in% visible_ids, , drop = FALSE]
  if (user$role == "student") df <- df[df$student_id == user$linked_id, , drop = FALSE]
  if (user$role == "parent") {
    kids <- .parent_linked_student_ids(user$linked_id)
    df <- df[df$student_id %in% kids, , drop = FALSE]
  }
  if (!is.null(student_id))   df <- df[df$student_id == student_id, , drop = FALSE]
  df
}

#* @get /api/emotions
function(req, lecture_id = NULL, student_id = NULL) {
  require_auth(req)
  .emotions_for_user(req$user, lecture_id, student_id)
}

#* Serialize all (role-scoped) emotions as CSV.
#* @serializer contentType list(type = "text/csv")
#* @get /api/emotions/csv
function(req, res) {
  require_admin(req)
  df <- .emotions_for_user(req$user)
  tf <- tempfile(fileext = ".csv")
  utils::write.csv(df, tf, row.names = FALSE)
  res$setHeader("Content-Disposition", "attachment; filename=emotions.csv")
  readBin(tf, "raw", n = file.size(tf))
}

.mark_to_grade <- function(mark) {
  if (is.na(mark)) return(NA_character_)
  if (mark >= 97) return("A*")
  if (mark >= 93) return("A")
  if (mark >= 90) return("A-")
  if (mark >= 87) return("B+")
  if (mark >= 83) return("B")
  if (mark >= 80) return("B-")
  if (mark >= 77) return("C+")
  if (mark >= 73) return("C")
  if (mark >= 70) return("C-")
  if (mark >= 67) return("D+")
  if (mark >= 63) return("D")
  if (mark >= 60) return("D-")
  "F"
}

.grades_for_user <- function(user, student_id = NULL, q = NULL) {
  emo <- .emotions_for_user(user, student_id = student_id)
  if (nrow(emo) == 0) return(data.frame())

  emo$engagement_score <- as.numeric(emo$engagement_score)
  emo <- emo[!is.na(emo$engagement_score), , drop = FALSE]
  if (nrow(emo) == 0) return(data.frame())

  lectures <- fs_collection_df("lectures")
  if (nrow(lectures) == 0) return(data.frame())

  lecture_ids <- if ("id" %in% names(lectures)) lectures$id else lectures$lecture_id
  subject_id <- lectures$subject_id[match(emo$lecture_id, lecture_ids)]
  doctor_id <- lectures$doctor_id[match(emo$lecture_id, lecture_ids)]

  g <- data.frame(
    student_id = as.character(emo$student_id),
    subject_id = as.character(subject_id),
    doctor_id = as.character(doctor_id),
    engagement_score = as.numeric(emo$engagement_score),
    stringsAsFactors = FALSE
  )
  g <- g[!is.na(g$subject_id) & nzchar(g$subject_id), , drop = FALSE]
  if (nrow(g) == 0) return(data.frame())

  marks <- stats::aggregate(
    engagement_score ~ student_id + subject_id + doctor_id,
    data = g,
    FUN = function(x) round(mean(x, na.rm = TRUE) * 100, 1)
  )
  names(marks)[names(marks) == "engagement_score"] <- "mark"

  counts <- stats::aggregate(
    engagement_score ~ student_id + subject_id + doctor_id,
    data = g,
    FUN = length
  )
  names(counts)[names(counts) == "engagement_score"] <- "observations"

  out <- merge(marks, counts,
               by = c("student_id", "subject_id", "doctor_id"),
               all.x = TRUE)
  out$grade <- vapply(out$mark, .mark_to_grade, character(1))

  students <- fs_collection_df("students")
  if (nrow(students) > 0) {
    student_ids <- if ("id" %in% names(students)) students$id else students$student_id
    out$student_name <- students$name[match(out$student_id, student_ids)]
  } else {
    out$student_name <- NA_character_
  }

  subjects <- fs_collection_df("subjects")
  if (nrow(subjects) > 0) {
    subject_ids <- if ("id" %in% names(subjects)) subjects$id else subjects$subject_id
    out$subject_name <- subjects$name[match(out$subject_id, subject_ids)]
    out$subject_code <- subjects$code[match(out$subject_id, subject_ids)]
  } else {
    out$subject_name <- NA_character_
    out$subject_code <- NA_character_
  }

  doctors <- fs_collection_df("doctors")
  if (nrow(doctors) > 0) {
    doctor_ids <- if ("id" %in% names(doctors)) doctors$id else doctors$doctor_id
    out$doctor_name <- doctors$name[match(out$doctor_id, doctor_ids)]
  } else {
    out$doctor_name <- NA_character_
  }

  q <- trimws(as.character(q %||% ""))
  if (nzchar(q)) {
    hay <- paste(
      out$student_id %||% "",
      out$student_name %||% "",
      out$subject_id %||% "",
      out$subject_name %||% "",
      out$doctor_name %||% "",
      out$grade %||% ""
    )
    out <- out[grepl(q, hay, ignore.case = TRUE, perl = TRUE), , drop = FALSE]
  }

  out <- out[order(out$student_name %||% out$student_id,
                   out$subject_name %||% out$subject_id), , drop = FALSE]
  rownames(out) <- NULL
  out
}

#* Role-scoped gradebook (mark out of 100 + letter grade) per student and subject.
#* Query params:
#*   student_id: optional, further narrows results if caller can view that student
#*   q: optional free-text search
#* @get /api/grades
function(req, student_id = NULL, q = NULL) {
  require_auth(req)
  sid <- trimws(as.character(student_id %||% ""))
  sid <- if (nzchar(sid)) sid else NULL
  if (!is.null(sid) && !.can_view_student(req$user, sid)) {
    stop(api_error(403, "forbidden"))
  }
  .grades_for_user(req$user, student_id = sid, q = q)
}

#* @get /api/analytics/engagement
function(req) {
  require_auth(req)
  df <- .emotions_for_user(req$user)
  if (nrow(df) == 0) return(list())
  df$engagement_score <- as.numeric(df$engagement_score)
  agg <- dplyr::summarise(
    dplyr::group_by(df, lecture_id),
    n = dplyr::n(),
    mean_engagement = round(mean(engagement_score, na.rm = TRUE), 3),
    .groups = "drop"
  )
  as.list(agg)
}

#* @get /api/analytics/sleep
function(req) {
  require_auth(req)
  df <- .emotions_for_user(req$user)
  if (nrow(df) == 0) return(list())
  agg <- dplyr::summarise(
    dplyr::group_by(df, lecture_id),
    n = dplyr::n(),
    sleep_rate   = round(mean(state == "sleeping", na.rm = TRUE), 3),
    head_down    = round(mean(sleep_reason == "head_down",   na.rm = TRUE), 3),
    eyes_closed  = round(mean(sleep_reason == "eyes_closed", na.rm = TRUE), 3),
    both         = round(mean(sleep_reason == "both",        na.rm = TRUE), 3),
    .groups = "drop"
  )
  as.list(agg)
}

#* @get /api/analytics/gestures
function(req, lecture_id = NULL) {
  require_auth(req)
  df <- .emotions_for_user(req$user, lecture_id = lecture_id)
  if (nrow(df) == 0) return(list())
  agg <- dplyr::count(
    dplyr::filter(df, !is.na(gesture) & gesture != "none"),
    lecture_id, gesture, name = "count"
  )
  as.list(agg)
}

#* @get /api/analytics/heatmap
function(req) {
  require_auth(req)
  df <- .emotions_for_user(req$user)
  if (nrow(df) == 0) return(list(cells = list()))
  df$engagement_score <- as.numeric(df$engagement_score)
  df$date <- substr(as.character(df$timestamp), 1, 10)
  lectures <- fs_collection_df("lectures")
  agg <- dplyr::summarise(
    dplyr::group_by(df, lecture_id, date),
    engagement_mean = round(mean(engagement_score, na.rm = TRUE), 3),
    sleep_rate      = round(mean(state == "sleeping", na.rm = TRUE), 3),
    .groups = "drop"
  )
  # Attach doctor_id from the lectures collection for the front-end heatmap.
  agg$doctor_id <- lectures$doctor_id[match(agg$lecture_id, lectures$id)]
  list(cells = as.list(agg))
}

#* @get /api/analytics/student/<id>/comparison
function(req, id) {
  require_auth(req)
  u <- req$user
  if (!.can_view_student(u, id)) stop(api_error(403, "forbidden"))
  # Doctors: must have the student in one of their lectures.
  visible_lectures <- .lectures_visible_to(u)
  all_emotions <- fs_collection_df("emotions")
  if (nrow(all_emotions) == 0) return(list(self_mean = 0, class_mean = 0, per_lecture = list()))
  all_emotions$engagement_score <- as.numeric(all_emotions$engagement_score)
  in_visible <- all_emotions$lecture_id %in% visible_lectures$id
  df <- all_emotions[in_visible, , drop = FALSE]

  self   <- df[df$student_id == id, , drop = FALSE]
  others <- df[df$student_id != id, , drop = FALSE]

  per_lecture <- lapply(unique(df$lecture_id), function(lec) {
    s <- self[self$lecture_id == lec, , drop = FALSE]
    o <- others[others$lecture_id == lec, , drop = FALSE]
    list(lecture_id = lec,
         self       = if (nrow(s) > 0) round(mean(s$engagement_score, na.rm = TRUE), 3) else NA,
         class_mean = if (nrow(o) > 0) round(mean(o$engagement_score, na.rm = TRUE), 3) else NA)
  })
  list(
    self_mean   = round(mean(self$engagement_score,   na.rm = TRUE), 3),
    class_mean  = round(mean(others$engagement_score, na.rm = TRUE), 3),
    per_lecture = per_lecture
  )
}

# ============================================================
# §10 Exports — CSV / Excel downloads
# ============================================================

.write_csv_bytes <- function(df, filename, res) {
  tf <- tempfile(fileext = ".csv")
  utils::write.csv(df, tf, row.names = FALSE)
  res$setHeader("Content-Type", "text/csv")
  res$setHeader("Content-Disposition", sprintf("attachment; filename=%s", filename))
  readBin(tf, "raw", n = file.size(tf))
}

.write_xlsx_bytes <- function(df, filename, res) {
  tf <- tempfile(fileext = ".xlsx")
  writexl::write_xlsx(as.data.frame(df), tf)
  res$setHeader("Content-Type",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
  res$setHeader("Content-Disposition", sprintf("attachment; filename=%s", filename))
  readBin(tf, "raw", n = file.size(tf))
}

#* @serializer contentType list(type = "text/csv")
#* @get /api/exports/emotions.csv
function(req, res) {
  require_auth(req)
  .write_csv_bytes(.emotions_for_user(req$user), "emotions.csv", res)
}

#* @serializer contentType list(type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
#* @get /api/exports/emotions.xlsx
function(req, res) {
  require_auth(req)
  .write_xlsx_bytes(.emotions_for_user(req$user), "emotions.xlsx", res)
}

.engagement_agg <- function(df) {
  if (nrow(df) == 0) return(df)
  df$engagement_score <- as.numeric(df$engagement_score)
  dplyr::summarise(
    dplyr::group_by(df, lecture_id, student_id),
    observations = dplyr::n(),
    mean_engagement = round(mean(engagement_score, na.rm = TRUE), 3),
    sleep_rate = round(mean(state == "sleeping", na.rm = TRUE), 3),
    .groups = "drop"
  )
}

#* @serializer contentType list(type = "text/csv")
#* @get /api/exports/engagement.csv
function(req, res) {
  require_auth(req)
  .write_csv_bytes(.engagement_agg(.emotions_for_user(req$user)), "engagement.csv", res)
}

#* @serializer contentType list(type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
#* @get /api/exports/engagement.xlsx
function(req, res) {
  require_auth(req)
  .write_xlsx_bytes(.engagement_agg(.emotions_for_user(req$user)), "engagement.xlsx", res)
}

.attendance_agg <- function(df) {
  if (nrow(df) == 0) return(df)
  df$timestamp <- as.character(df$timestamp)
  dplyr::summarise(
    dplyr::group_by(df, lecture_id, student_id),
    observations = dplyr::n(),
    first_seen   = min(timestamp, na.rm = TRUE),
    last_seen    = max(timestamp, na.rm = TRUE),
    .groups = "drop"
  )
}

.attendance_current <- function(df, window_minutes = 5) {
  if (nrow(df) == 0) {
    return(list(summary = list(present = 0, absent = 0, attendance_rate = 0), rows = list()))
  }
  df$timestamp <- as.POSIXct(df$timestamp, tz = "UTC")
  cutoff <- as.POSIXct(Sys.time(), tz = "UTC") - as.difftime(window_minutes, units = "mins")
  recent <- df[!is.na(df$timestamp) & df$timestamp >= cutoff, , drop = FALSE]

  all_students <- unique(df$student_id)
  present <- unique(recent$student_id)
  absent <- setdiff(all_students, present)
  rows <- dplyr::summarise(
    dplyr::group_by(df, student_id),
    last_seen = max(timestamp, na.rm = TRUE),
    observations = dplyr::n(),
    attention_mean = round(mean(as.numeric(attention_score), na.rm = TRUE), 1),
    cheat_risk_max = round(max(as.numeric(cheat_score), na.rm = TRUE), 1),
    .groups = "drop"
  )
  rows$present <- rows$student_id %in% present
  rows <- rows[order(rows$present, rows$last_seen, decreasing = c(TRUE, TRUE, TRUE)), , drop = FALSE]
  list(
    summary = list(
      present = length(present),
      absent = length(absent),
      attendance_rate = if (length(all_students) > 0) round(length(present) / length(all_students), 3) else 0
    ),
    rows = as.list(rows)
  )
}

.recommendation_text_r <- function(attention, mark = NA_real_, grade = NA_character_, attendance_rate = NA_real_) {
  recs <- character(0)
  if (!is.na(mark) && mark < 70) {
    recs <- c(recs, "Review the last lecture notes and retry the hardest exercises.")
  }
  if (!is.na(attendance_rate) && attendance_rate < 0.8) {
    recs <- c(recs, "Improve attendance to protect your grade trend.")
  }
  if (!is.na(attention) && attention < 50) {
    recs <- c(recs, "Reduce distractions and keep the camera view centered on you.")
  } else if (!is.na(attention) && attention < 70) {
    recs <- c(recs, "Stay active: ask questions or follow along with the lecturer.")
  }
  if (!is.na(grade) && grade %in% c("D", "D-", "F")) {
    recs <- c(recs, "Schedule a quick revision plan with your doctor/teacher.")
  }
  if (length(recs) == 0) {
    recs <- c(recs, "Maintain your current habits and keep the momentum going.")
  }
  recs
}

.recommendations_for_student <- function(user, student_id) {
  if (is.null(student_id) || !nzchar(student_id)) return(list())
  if (!.can_view_student(user, student_id)) stop(api_error(403, "forbidden"))
  df <- .emotions_for_user(user, student_id = student_id)
  if (nrow(df) == 0) return(list())
  df$engagement_score <- as.numeric(df$engagement_score)
  visible_lectures <- .lectures_visible_to(user)
  total_visible_lectures <- if (nrow(visible_lectures) > 0) length(unique(visible_lectures$id)) else 0
  attendance_rate <- if (total_visible_lectures > 0) {
    round(length(unique(df$lecture_id)) / total_visible_lectures, 3)
  } else {
    NA_real_
  }
  attention_mean <- round(mean(as.numeric(df$attention_score), na.rm = TRUE), 1)
  last_mark <- NA_real_
  last_grade <- NA_character_
  grades <- .grades_for_user(user, student_id = student_id)
  if (nrow(grades) > 0) {
    last_mark <- round(mean(as.numeric(grades$mark), na.rm = TRUE), 1)
    if ("grade" %in% names(grades)) last_grade <- as.character(grades$grade[[1]])
  }
  recs <- .recommendation_text_r(attention = attention_mean, mark = last_mark,
                                 grade = last_grade, attendance_rate = attendance_rate)
  list(
    student_id = student_id,
    attention_mean = attention_mean,
    attendance_rate = attendance_rate,
    mark = last_mark,
    grade = last_grade,
    recommendations = recs
  )
}

#* @serializer contentType list(type = "text/csv")
#* @get /api/exports/attendance.csv
function(req, res) {
  require_auth(req)
  .write_csv_bytes(.attendance_agg(.emotions_for_user(req$user)), "attendance.csv", res)
}

#* @serializer contentType list(type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
#* @get /api/exports/attendance.xlsx
function(req, res) {
  require_auth(req)
  .write_xlsx_bytes(.attendance_agg(.emotions_for_user(req$user)), "attendance.xlsx", res)
}

#* @get /api/attendance/current
function(req, lecture_id = NULL, window_minutes = 5) {
  require_auth(req)
  df <- .emotions_for_user(req$user, lecture_id = lecture_id)
  .attendance_current(df, window_minutes = as.integer(window_minutes))
}

#* @get /api/recommendations/student/<id>
function(req, id) {
  require_auth(req)
  .recommendations_for_student(req$user, id)
}

# ============================================================
# §11 Notifications — doctor → student email via Brevo
# ============================================================

#* @post /api/notifications
function(req) {
  require_doctor(req)
  body <- jsonlite::fromJSON(req$postBody, simplifyVector = FALSE)
  if (is.null(body$lecture_id) || is.null(body$subject) || is.null(body$body)) {
    stop(api_error(400, "lecture_id, subject, and body are required"))
  }

  lec_doc <- tryCatch(fs_get(sprintf("lectures/%s", body$lecture_id)),
                      error = function(e) NULL)
  if (is.null(lec_doc)) stop(api_error(404, "lecture not found"))
  lec <- fs_unwrap_fields(lec_doc$fields)
  if (!identical(lec$doctor_id, req$user$linked_id)) {
    stop(api_error(403, "not your lecture"))
  }

  # Resolve recipient emails.
  enrolled <- unlist(lec$enrolled_student_ids %||% list())
  target_ids <- body$student_ids %||% as.list(enrolled)
  target_ids <- unlist(target_ids)

  students <- fs_collection_df("students")
  hits <- students[students$id %in% target_ids, , drop = FALSE]
  recipients <- lapply(seq_len(nrow(hits)), function(i) {
    list(email = hits$email[i], name = hits$name[i])
  })
  if (length(recipients) == 0) {
    stop(api_error(400, "no resolvable recipients"))
  }

  result <- send_email(
    to      = recipients,
    subject = body$subject,
    html_body = sprintf("<div>%s</div>", body$body)
  )

  audit <- drop_empty(list(
    lecture_id = body$lecture_id,
    sender_doctor_id = req$user$linked_id,
    subject    = body$subject,
    recipients = as.list(unlist(lapply(recipients, `[[`, "email"))),
    status     = result$status,
    message_id = result$message_id,
    error      = result$error,
    sent_at    = now_iso()
  ))
  created <- fs_create("notifications", audit)
  list(status = result$status,
       message_id = result$message_id,
       recipients = length(recipients),
       notification_id = sub(".*/", "", created$name))
}

#* @get /api/notifications
function(req) {
  require_auth(req)
  if (!(req$user$role %in% c("doctor", "admin"))) stop(api_error(403, "forbidden"))
  all <- fs_collection_df("notifications")
  if (nrow(all) == 0) return(all)
  if (req$user$role == "doctor") {
    all <- all[!is.na(all$sender_doctor_id) &
               all$sender_doctor_id == req$user$linked_id, , drop = FALSE]
  }
  all
}

# ============================================================
# §12 Lecture reports + transcripts
# ============================================================

#* @post /api/lectures/<id>/generate-report
function(req, res, id) {
  require_auth(req)
  u <- req$user
  doc <- tryCatch(fs_get(sprintf("lectures/%s", id)), error = function(e) NULL)
  if (is.null(doc)) stop(api_error(404, "lecture not found"))
  data <- fs_unwrap_fields(doc$fields)
  if (u$role == "doctor" && !identical(data$doctor_id, u$linked_id))
    stop(api_error(403, "not your lecture"))
  if (u$role == "student") stop(api_error(403, "forbidden"))
  out <- tryCatch(render_lecture_report(id), error = function(e) {
    stop(api_error(500, sprintf("report render failed: %s", conditionMessage(e))))
  })
  list(status = "generated", path = out)
}

#* @get /api/lectures/<id>/report
function(req, res, id) {
  require_auth(req)
  u <- req$user
  doc <- tryCatch(fs_get(sprintf("lectures/%s", id)), error = function(e) NULL)
  if (is.null(doc)) stop(api_error(404, "lecture not found"))
  data <- fs_unwrap_fields(doc$fields)
  if (u$role == "doctor" && !identical(data$doctor_id, u$linked_id))
    stop(api_error(403, "not your lecture"))
  if (u$role == "student" &&
      !(u$linked_id %in% unlist(data$enrolled_student_ids %||% list()))) {
    stop(api_error(403, "not enrolled"))
  }
  if (is.null(data$report_path)) {
    return(list(status = "not_generated",
                hint = "POST /api/lectures/<id>/generate-report first"))
  }
  list(url = sprintf("%s/api/lectures/%s/report-file",
                     sub("/$", "", env_or("PUBLIC_BASE_URL",
                          sprintf("http://localhost:%s",
                                  env_or("PLUMBER_PORT", "8000")))),
                     id),
       generated_at = data$report_generated_at,
       format = data$report_format)
}

#* @serializer contentType list(type = "application/octet-stream")
#* @get /api/lectures/<id>/report-file
function(req, res, id) {
  require_auth(req)
  doc <- tryCatch(fs_get(sprintf("lectures/%s", id)), error = function(e) NULL)
  if (is.null(doc)) stop(api_error(404, "lecture not found"))
  data <- fs_unwrap_fields(doc$fields)
  u <- req$user
  if (u$role == "doctor" && !identical(data$doctor_id, u$linked_id))
    stop(api_error(403, "not your lecture"))
  if (u$role == "student" &&
      !(u$linked_id %in% unlist(data$enrolled_student_ids %||% list())))
    stop(api_error(403, "not enrolled"))
  if (is.null(data$report_path) || !file.exists(data$report_path)) {
    stop(api_error(404, "report not generated yet"))
  }
  res$setHeader("Content-Type",
                if (identical(data$report_format, "pdf")) "application/pdf" else "text/html")
  res$setHeader("Content-Disposition",
                sprintf("inline; filename=%s.%s", id, data$report_format %||% "html"))
  readBin(data$report_path, "raw", n = file.size(data$report_path))
}

#* @get /api/lectures/<id>/transcript
function(req, res, id) {
  require_auth(req)
  u <- req$user
  doc <- tryCatch(fs_get(sprintf("lectures/%s", id)), error = function(e) NULL)
  if (is.null(doc)) stop(api_error(404, "lecture not found"))
  data <- fs_unwrap_fields(doc$fields)
  if (u$role == "doctor" && !identical(data$doctor_id, u$linked_id))
    stop(api_error(403, "not your lecture"))
  if (u$role == "student" &&
      !(u$linked_id %in% unlist(data$enrolled_student_ids %||% list())))
    stop(api_error(403, "not enrolled"))
  tid <- data$transcript_id %||% id
  parent <- tryCatch(fs_get(sprintf("transcripts/%s", tid)), error = function(e) NULL)
  if (is.null(parent)) return(list(language = NA, segments = list()))
  segments <- tryCatch(fs_list(sprintf("transcripts/%s/segments", tid)),
                       error = function(e) list())
  list(
    language = fs_value(parent$fields$language),
    segments = lapply(segments, function(s) fs_unwrap_fields(s$fields))
  )
}

# ============================================================
# §13 Admin dashboard
# ============================================================

#* @get /api/admin/stats
function(req) {
  require_admin(req)
  students    <- fs_collection_df("students")
  doctors     <- fs_collection_df("doctors")
  lectures    <- fs_collection_df("lectures")
  emotions    <- fs_collection_df("emotions")
  mean_eng <- if (nrow(emotions) > 0) {
    round(mean(as.numeric(emotions$engagement_score), na.rm = TRUE), 3)
  } else 0
  sleep_rate <- if (nrow(emotions) > 0) {
    round(mean(emotions$state == "sleeping", na.rm = TRUE), 3)
  } else 0
  top_gestures <- if (nrow(emotions) > 0) {
    g <- emotions[!is.na(emotions$gesture) & emotions$gesture != "none", , drop = FALSE]
    if (nrow(g) > 0) as.list(dplyr::slice_max(dplyr::count(g, gesture), n, n = 5))
    else list()
  } else list()
  list(
    total_students = nrow(students),
    total_doctors  = nrow(doctors),
    total_lectures = nrow(lectures),
    total_observations = nrow(emotions),
    mean_engagement = mean_eng,
    sleep_rate      = sleep_rate,
    top_gestures    = top_gestures
  )
}
