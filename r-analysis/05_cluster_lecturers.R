# 05 — k-means clustering of lecturers by their teaching-engagement profile.
#
# Features per lecturer: mean engagement, sleep rate, hand_raised rate,
# phone rate (if present), observation count.
#
# With too few lecturers for kmeans to be meaningful (n < 3), we fall back to
# a plain bar chart labelled as such so the script doesn't crash the pipeline.

source("load_data.R")
suppressPackageStartupMessages({
  library(ggplot2)
  library(dplyr)
  library(cluster)
  library(factoextra)
})

df <- load_from_csv() |> attach_doctor_id()

features <- df |>
  group_by(doctor_id) |>
  summarise(
    mean_engagement = mean(engagement_score, na.rm = TRUE),
    sleep_rate      = mean(state == "sleeping", na.rm = TRUE),
    hand_rate       = mean(gesture == "hand_raised", na.rm = TRUE),
    n_obs           = n(),
    .groups = "drop"
  )

cat("Lecturer features:\n"); print(features)

if (nrow(features) < 3) {
  # Not enough lecturers to cluster — render a labelled placeholder.
  p <- ggplot(features, aes(x = reorder(doctor_id, -mean_engagement),
                            y = mean_engagement, fill = doctor_id)) +
    geom_col(show.legend = FALSE) +
    labs(title = "Lecturer engagement (clustering skipped — need ≥ 3 lecturers)",
         x = NULL, y = "mean engagement") +
    theme_minimal(base_size = 12)
  out <- file.path(plot_dir(), "05_cluster_lecturers.png")
  ggsave(out, p, width = 8, height = 5, dpi = 120)
  cat("saved (placeholder):", out, "\n")
  quit(status = 0)
}

X <- features |> select(-doctor_id, -n_obs) |> scale()
k <- min(3, nrow(X) - 1)
km <- kmeans(X, centers = k, nstart = 10)

p <- factoextra::fviz_cluster(km, data = X, labelsize = 10,
                              geom = c("point", "text"),
                              main = sprintf("Lecturer clusters (k = %d)", k)) +
  theme_minimal(base_size = 12)

out <- file.path(plot_dir(), "05_cluster_lecturers.png")
ggsave(out, p, width = 8, height = 6, dpi = 120)
cat("saved:", out, "\n")
