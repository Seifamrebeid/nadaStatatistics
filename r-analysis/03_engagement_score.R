# 03 — mean engagement per student and per lecture.

source("load_data.R")
suppressPackageStartupMessages({
  library(ggplot2)
  library(dplyr)
})

df <- load_from_csv()

per_student <- df |>
  group_by(student_id) |>
  summarise(n = n(), mean_engagement = mean(engagement_score, na.rm = TRUE),
            .groups = "drop") |>
  arrange(desc(mean_engagement))

per_lecture <- df |>
  group_by(lecture_id) |>
  summarise(n = n(), mean_engagement = mean(engagement_score, na.rm = TRUE),
            sleep_rate = mean(state == "sleeping", na.rm = TRUE),
            .groups = "drop")

cat("Per-student engagement:\n"); print(per_student, n = 20)
cat("\nPer-lecture engagement:\n"); print(per_lecture)

p <- ggplot(per_student, aes(x = reorder(student_id, mean_engagement),
                             y = mean_engagement, fill = mean_engagement)) +
  geom_col(show.legend = FALSE) +
  coord_flip() +
  labs(title = "Mean engagement score per student",
       x = NULL, y = "engagement (0–1)") +
  theme_minimal(base_size = 12) +
  scale_fill_gradient(low = "#d73027", high = "#1a9850")

out <- file.path(plot_dir(), "03_engagement_by_student.png")
ggsave(out, p, width = 8, height = 5, dpi = 120)
cat("saved:", out, "\n")
