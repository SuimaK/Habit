import { Component, type ReactNode } from 'react'
import { readKeptCopy, restoreKeptCopy } from './storage'

const KEY = 'habit-game/state/v1'

/** Если что-то сломалось при отрисовке — не белый экран, а понятное сообщение и выход. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: boolean; confirm: boolean }> {
  state = { error: false, confirm: false }

  static getDerivedStateFromError() {
    return { error: true }
  }

  private reset = () => {
    try {
      // Повреждённые данные не удаляем, а откладываем в сторону.
      const raw = localStorage.getItem(KEY)
      if (raw) localStorage.setItem(`${KEY}/broken-${Date.now()}`, raw)
      localStorage.removeItem(KEY)
    } catch {
      /* ничего */
    }
    location.reload()
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="crash">
        <h1>Что-то пошло не так</h1>
        <p>Попробуй перезапустить приложение.</p>
        <button onClick={() => location.reload()}>Перезапустить</button>
        {readKeptCopy() && (
          <button onClick={() => restoreKeptCopy() && location.reload()}>Вернуть данные, какими они были до восстановления из копии</button>
        )}
        {this.state.confirm ? (
          <button className="danger" onClick={this.reset}>
            Да, начать заново
          </button>
        ) : (
          <button className="link" onClick={() => this.setState({ confirm: true })}>
            Не помогает — начать заново (старые данные сохранятся отдельно)
          </button>
        )}
      </div>
    )
  }
}
