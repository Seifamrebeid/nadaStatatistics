# 06 — k-means clustering of student × lecture (subject) pairs by engagement pattern.
#
# Feature per (student_id, lecture_id): mean engagement, sleep rate, hand rate.

source("load_data.R")
suppressPackageStartupMessages({
  library(ggplot2)
  library(dplyr)
  library(cluster)
  library(factoextra)
})

df <- load_from_csv()

pairs <- df |>
  group_by(student_id, lecture_id) |>
  summarise(
    mean_engagement = mean(engagement_score, na.rm = TRUE),
    sleep_rate      = mean(state == "sleeping", na.rm = TRUE),
    hand_rate       = mean(gesture == "hand_raised", na.rm = TRUE),
    n_obs           = n(),
    .groups = "drop"
  ) |>
  mutate(label = paste(student_id, lecture_id, sep = "|"))

cat("Student-subject features:\n"); print(pairs)

if (nrow(pairs) < 3) {
  p <- ggplot(pairs, aes(x = label, y = mean_engagement, fill = label)) +
    geom_col(show.legend = FALSE) +
    labs(title = "Student × lecture engagement (clustering skipped — need ≥ 3 pairs)",
         x = NULL, y = "mean engagement") +
    theme_minimal(base_size = 11) +
    theme(axis.text.x = element_text(angle = 30, hjust = 1))
  out <- file.path(plot_dir(), "06_cluster_student_subject.png")
  ggsave(out, p, width = 8, height = 5, dpi = 120)
  cat("saved (placeholder):", out, "\n")
  quit(status = 0)
}

X <- pairs |> select(mean_engagement, sleep_rate, hand_rate) |> scale()
k <- min(3, nrow(X) - 1)
km <- kmeans(X, centers = k, nstart = 10)

p <- factoextra::fviz_cluster(km, data = X, labelsize = 9,
                              geom = c("point", "text"),
                              main = sprintf("Student × subject clusters (k = %d)", k)) +
  theme_minimal(base_size = 12)

out <- file.path(plot_dir(), "06_cluster_student_subject.png")
ggsave(out, p, width = 9, height = 6, dpi = 120)
cat("saved:", out, "\n")
