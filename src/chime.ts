/** Короткий мягкий звон по окончании таймера. Контекст создаётся по тапу «Старт» — так требует Safari. */
let ctx: AudioContext | null = null

export function unlockAudio() {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return
    ctx ??= new AC()
    if (ctx.state === 'suspended') void ctx.resume()
  } catch {
    ctx = null
  }
}

export function chime() {
  try {
    navigator.vibrate?.([200, 100, 200])
  } catch {
    /* нет вибрации */
  }
  if (!ctx) return
  try {
    const t0 = ctx.currentTime
    for (const [i, freq] of [660, 880, 990].entries()) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      const start = t0 + i * 0.35
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(0.25, start + 0.03)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 1.6)
      osc.connect(gain).connect(ctx.destination)
      osc.start(start)
      osc.stop(start + 1.7)
    }
  } catch {
    /* без звука */
  }
}
