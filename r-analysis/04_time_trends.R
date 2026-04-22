# 04 — engagement over time.
#
# One line per lecture, with a smoothed trend on top.

source("load_data.R")
suppressPackageStartupMessages({
  library(ggplot2)
  library(dplyr)
  library(lubridate)
})

df <- load_from_csv()

# Bucket to 30-second windows so the chart reads as a trend, not a sawtooth.
bucketed <- df |>
  mutate(bucket = lubridate::floor_date(timestamp, unit = "30 seconds")) |>
  group_by(lecture_id, bucket) |>
  summarise(engagement = mean(engagement_score, na.rm = TRUE),
            .groups = "drop")

p <- ggplot(bucketed, aes(x = bucket, y = engagement, colour = lecture_id)) +
  geom_line(linewidth = 0.7, alpha = 0.85) +
  geom_point(size = 1.6, alpha = 0.85) +
  geom_smooth(se = FALSE, linewidth = 0.6, linetype = "dashed",
              method = "loess", formula = y ~ x, span = 0.6) +
  labs(title = "Engagement over time (30-second buckets)",
       x = "time", y = "mean engagement", colour = "lecture") +
  theme_minimal(base_size = 12)

out <- file.path(plot_dir(), "04_engagement_over_time.png")
ggsave(out, p, width = 10, height = 5, dpi = 120)
cat("saved:", out, "\n")
