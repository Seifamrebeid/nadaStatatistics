# 01 — frequency distribution of emotions across the whole dataset.

source("load_data.R")
suppressPackageStartupMessages({
  library(ggplot2)
  library(scales)
})

df <- load_from_csv()

freq <- df |>
  dplyr::count(emotion, sort = TRUE) |>
  dplyr::mutate(pct = n / sum(n))

cat("Emotion frequency:\n")
print(freq)

p <- ggplot(freq, aes(x = reorder(emotion, -n), y = n, fill = emotion)) +
  geom_col(show.legend = FALSE) +
  geom_text(aes(label = sprintf("%d (%.1f%%)", n, pct * 100)),
            vjust = -0.3, size = 3.5) +
  scale_y_continuous(expand = expansion(mult = c(0, 0.12))) +
  labs(title = "Emotion frequency — all observations",
       x = NULL, y = "observations") +
  theme_minimal(base_size = 12)

out <- file.path(plot_dir(), "01_emotion_frequency.png")
ggsave(out, p, width = 8, height = 5, dpi = 120)
cat("saved:", out, "\n")
