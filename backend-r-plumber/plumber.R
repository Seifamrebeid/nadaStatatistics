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
# §1 Filters
# ============================================================

#* @filter cors
function(req, res) cors_filter(req, res)

#* @filter auth
function(req, res) auth_filter(req, res)

#* @plumber
function(pr) {
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
    active[0, , drop = FALSE]
  )
}

#* @get /api/students
function(req) { require_auth(req); .students_visible_to(req$user) }

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
  if (req$user$role == "student" && req$user$linked_id != id)
    stop(api_error(403, "forbidden"))
  doc <- tryCatch(fs_get(sprintf("students/%s", id)), error = function(e) NULL)
  if (is.null(doc)) stop(api_error(404, "student not found"))
  c(list(id = id), fs_unwrap_fields(doc$fields))
}

#* @put /api/students/<id>
function(req, res, id) {
  require_admin(req)
  body <- jsonlite::fromJSON(req$postBody, simplifyVector = FALSE)
  patch <- drop_empty(body[c("name", "email", "active")])
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
  doctor_id <- if (req$user$role == "admin") body$doctor_id else req$user$linked_id
  if (is.null(doctor_id)) stop(api_error(400, "doctor_id is required"))
  lecture_id <- body$lecture_id %||% new_id("lec")
  fs_create_at("lectures", lecture_id, drop_empty(list(
    lecture_id           = lecture_id,
    title                = body$title,
    doctor_id            = doctor_id,
    status               = body$status %||% "scheduled",
    enrolled_student_ids = body$enrolled_student_ids %||% list(),
    scheduled_at         = body$scheduled_at,
    created_at           = now_iso()
  )))
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
  c(list(id = id), data)
}

#* @put /api/lectures/<id>
function(req, res, id) {
  require_auth(req)
  u <- req$user
  doc <- tryCatch(fs_get(sprintf("lectures/%s", id)), error = function(e) NULL)
  if (is.null(doc)) stop(api_error(404, "lecture not found"))
  data <- fs_unwrap_fields(doc$fields)
  if (u$role == "doctor" && !identical(data$doctor_id, u$linked_id))
    stop(api_error(403, "not your lecture"))
  if (u$role == "student") stop(api_error(403, "forbidden"))
  body <- jsonlite::fromJSON(req$postBody, simplifyVector = FALSE)
  allowed <- c("title", "status", "enrolled_student_ids", "scheduled_at")
  if (u$role == "admin") allowed <- c(allowed, "doctor_id")
  patch <- drop_empty(body[allowed])
  if (length(patch) == 0) stop(api_error(400, "nothing to update"))
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
  if (u$role == "student" && u$linked_id != id) stop(api_error(403, "forbidden"))
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
