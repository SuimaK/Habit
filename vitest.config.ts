import { defineConfig } from 'vitest/config'

// Тесты гоняем в фиксированном часовом поясе, чтобы границы дней и 06:00 были предсказуемы.
process.env.TZ = 'Europe/Moscow'

export default defineConfig({
  test: { include: ['src/**/*.test.ts'] },
})
