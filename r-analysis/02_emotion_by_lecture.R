# 02 — emotion distribution faceted by lecture.

source("load_data.R")
suppressPackageStartupMessages({
  library(ggplot2)
  library(dplyr)
})

df <- load_from_csv()

by_lec <- df |>
  count(lecture_id, emotion) |>
  group_by(lecture_id) |>
  mutate(pct = n / sum(n)) |>
  ungroup()

cat("Emotion distribution per lecture:\n")
print(by_lec, n = 30)

p <- ggplot(by_lec, aes(x = reorder(emotion, -n), y = n, fill = emotion)) +
  geom_col(show.legend = FALSE) +
  facet_wrap(~ lecture_id, scales = "free_y") +
  labs(title = "Emotion distribution across lectures",
       x = NULL, y = "observations") +
  theme_minimal(base_size = 11) +
  theme(axis.text.x = element_text(angle = 35, hjust = 1))

out <- file.path(plot_dir(), "02_emotion_by_lecture.png")
ggsave(out, p, width = 10, height = 6, dpi = 120)
cat("saved:", out, "\n")
