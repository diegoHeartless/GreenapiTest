import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const API_URL = import.meta.env.VITE_GREEN_API_URL || 'https://api.green-api.com'
const savedInstance = import.meta.env.VITE_GREEN_API_INSTANCE_ID || ''
const savedToken = import.meta.env.VITE_GREEN_API_TOKEN || ''

function getConfig() {
  return {
    instanceId: localStorage.getItem('green_instance_id') || savedInstance,
    token: localStorage.getItem('green_token') || savedToken
  }
}

function apiUrl(action, config) {
  return `${API_URL.replace(/\/$/, '')}/waInstance${config.instanceId}/${action}/${config.token}`
}

function formatTime(date) {
  return new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit'
  }).format(date)
}

export default function App() {
  const [config, setConfig] = useState(getConfig)
  const [chatId, setChatId] = useState(localStorage.getItem('green_chat_id') || '')
  const [draft, setDraft] = useState('')
  const [messages, setMessages] = useState([])
  const [status, setStatus] = useState('Не подключено')
  const [error, setError] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(!getConfig().instanceId || !getConfig().token)
  const [sending, setSending] = useState(false)
  const polling = useRef(false)

  const canConnect = Boolean(config.instanceId && config.token)

  const visibleMessages = useMemo(
    () => messages.filter(m => !m.chatId || !chatId || m.chatId === chatId),
    [messages, chatId]
  )

  const receive = useCallback(async () => {
    if (!canConnect || polling.current) return

    polling.current = true

    try {
      const response = await fetch(apiUrl('receiveNotification', config))
      if (!response.ok) throw new Error(`Ошибка получения (${response.status})`)

      const notification = await response.json()
      if (!notification) return

      const body = notification.body || {}
      const data = body.messageData || {}
      const text = data.textMessageData?.textMessage || data.extendedTextMessageData?.text || ''
      const incomingChat = body.senderData?.chatId || body.chatId || ''

      if (text) {
        setMessages(prev => [
          ...prev,
          {
            id: notification.receiptId || crypto.randomUUID(),
            text,
            incoming: true,
            chatId: incomingChat,
            time: new Date()
          }
        ])
      }

      if (notification.receiptId) {
        await fetch(apiUrl(`deleteNotification/${notification.receiptId}`, config), {
          method: 'DELETE'
        })
      }
    } catch (e) {
      setError(e.message)
    } finally {
      polling.current = false
    }
  }, [canConnect, config])

  useEffect(() => {
    if (!canConnect) return undefined

    setStatus('Подключено')
    const timer = setInterval(receive, 1500)
    receive()

    return () => clearInterval(timer)
  }, [canConnect, receive])

  function saveSettings(event) {
    event.preventDefault()

    const instanceId = config.instanceId.trim()
    const token = config.token.trim()

    localStorage.setItem('green_instance_id', instanceId)
    localStorage.setItem('green_token', token)

    setConfig({ instanceId, token })
    setSettingsOpen(false)
    setError('')
  }

  function selectChat(value) {
    setChatId(value)
    localStorage.setItem('green_chat_id', value)
  }

  async function sendMessage(event) {
    event.preventDefault()

    const text = draft.trim()
    if (!text || !chatId.trim() || !canConnect) return

    setSending(true)
    setError('')

    try {
      const response = await fetch(apiUrl('sendMessage', config), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId: chatId.trim(),
          message: text
        })
      })

      if (!response.ok) {
        throw new Error(`Не удалось отправить сообщение (${response.status})`)
      }

      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        text,
        incoming: false,
        chatId: chatId.trim(),
        time: new Date()
      }])

      setDraft('')
    } catch (e) {
      setError(e.message)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">M</span>
          <span>MAX</span>
        </div>
        <button className="settings-button" onClick={() => setSettingsOpen(true)} aria-label="Настройки">
          ⚙
        </button>
      </header>

      <main className="workspace">
        <aside className="sidebar">
          <div className="profile">
            <div className="avatar">M</div>
            <div>
              <strong>Мои сообщения</strong>
              <small className={canConnect ? 'online' : ''}>{status}</small>
            </div>
          </div>

          <label className="search">
            <span>⌕</span>
            <input
              value={chatId}
              onChange={e => selectChat(e.target.value)}
              placeholder="Введите chatId"
            />
          </label>

          <div className="chat-list">
            {chatId ? (
              <button className="chat-preview active" type="button">
                <div className="avatar small">{chatId[0]?.toUpperCase() || 'C'}</div>
                <div>
                  <strong>{chatId}</strong>
                  <small>{visibleMessages.at(-1)?.text || 'Начните диалог'}</small>
                </div>
              </button>
            ) : (
              <p className="empty-list">Укажите chatId, чтобы начать диалог</p>
            )}
          </div>
        </aside>

        <section className="conversation">
          {chatId ? (
            <>
              <div className="conversation-head">
                <div className="avatar small">{chatId[0]?.toUpperCase() || 'C'}</div>
                <div>
                  <strong>{chatId}</strong>
                  <small>Текстовые сообщения</small>
                </div>
              </div>

              <div className="message-area">
                {visibleMessages.length === 0 && (
                  <div className="welcome">
                    <div className="welcome-icon">M</div>
                    <h2>Начните общение</h2>
                    <p>Отправляйте текстовые сообщения через GREEN-API</p>
                  </div>
                )}

                {visibleMessages.map(message => (
                  <div
                    key={message.id}
                    className={`message-row ${message.incoming ? 'incoming' : 'outgoing'}`}
                  >
                    <div className="message">
                      <span>{message.text}</span>
                      <small>{formatTime(message.time)} {!message.incoming && '✓'}</small>
                    </div>
                  </div>
                ))}
              </div>

              <form className="composer" onSubmit={sendMessage}>
                <input
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  placeholder="Написать сообщение..."
                  disabled={!canConnect || sending}
                />
                <button type="submit" disabled={!canConnect || !draft.trim() || sending} aria-label="Отправить">
                  ➤
                </button>
              </form>
            </>
          ) : (
            <div className="welcome start">
              <div className="welcome-icon">M</div>
              <h2>Ваши сообщения</h2>
              <p>Введите chatId слева, чтобы открыть диалог</p>
            </div>
          )}
        </section>
      </main>

      {error && (
        <div className="toast error">
          {error}
          <button type="button" onClick={() => setError('')}>×</button>
        </div>
      )}

      {settingsOpen && (
        <div className="modal-backdrop">
          <form className="modal" onSubmit={saveSettings}>
            <button type="button" className="close" onClick={() => setSettingsOpen(false)}>×</button>
            <h2>Подключение GREEN-API</h2>
            <p>Данные используются только в этом браузере.</p>

            <label>
              IdInstance
              <input
                value={config.instanceId}
                onChange={e => setConfig({ ...config, instanceId: e.target.value })}
                required
              />
            </label>

            <label>
              ApiTokenInstance
              <input
                type="password"
                value={config.token}
                onChange={e => setConfig({ ...config, token: e.target.value })}
                required
              />
            </label>

            <button className="primary" type="submit">Подключиться</button>
            <small className="hint">
              Получить данные можно в личном кабинете GREEN-API для MAX.
            </small>
          </form>
        </div>
      )}
    </div>
  )
}