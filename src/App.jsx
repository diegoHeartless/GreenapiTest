import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const API_URL = import.meta.env.VITE_GREEN_API_URL || 'https://api.green-api.com'

function getConfig() {
  return {
    instanceId: localStorage.getItem('green_instance_id') || '',
    token: localStorage.getItem('green_token') || ''
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

function normalizePhone(phone) {
  const value = (phone || '').replace(/[^\d]/g, '')
  if (!value) return ''
  return value
}

// Пример: если нужен формат вида 79001234567@c.us,
// можно заменить здесь. Для MVP достаточно использовать телефон как chatId,
// если у вашего GREEN-API так принято.
function normalizePhoneToChatId(phone) {
  const number = normalizePhone(phone)
  if (!number) return ''
  return number
}

export default function App() {
  const [config, setConfig] = useState(getConfig)
  const [status, setStatus] = useState('Не подключено')
  const [error, setError] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(true)
  const [phoneInput, setPhoneInput] = useState('')
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)

  const [activeChatId, setActiveChatId] = useState('')
  const [chats, setChats] = useState({}) // { [chatId]: [{ id, text, incoming, time }] }

  const pollingRef = useRef(false)

  const canConnect = Boolean(config.instanceId && config.token)

  const chatList = useMemo(() => Object.keys(chats), [chats])
  const activeMessages = activeChatId ? chats[activeChatId] || [] : []

  useEffect(() => {
    if (!canConnect) {
      setStatus('Не подключено')
      return
    }
    setStatus('Подключено')
    const timer = setInterval(receiveNotifications, 1500)
    receiveNotifications()
    return () => clearInterval(timer)
  }, [canConnect, config])

  const createOrOpenChat = useCallback((phone) => {
    const chatId = normalizePhoneToChatId(phone)
    if (!chatId) {
      setError('Введите корректный номер телефона')
      return
    }

    setChats(prev => {
      if (!prev[chatId]) {
        prev[chatId] = []
      }
      return { ...prev }
    })

    setActiveChatId(chatId)
    setPhoneInput('')
    setError('')
  }, [])

  const receiveNotifications = useCallback(async () => {
    if (!canConnect || pollingRef.current) return
    pollingRef.current = true

    try {
      const response = await fetch(apiUrl('receiveNotification', config))
      if (!response.ok) {
        const text = await response.text()
        throw new Error(`GREEN-API: ${response.status}. ${text || 'empty response'}`)
      }

      const raw = await response.text()
      if (!raw) return

      let notification
      try {
        notification = JSON.parse(raw)
      } catch {
        throw new Error('GREEN-API вернул не JSON')
      }

      if (!notification) return

      const body = notification.body || {}
      const data = body.messageData || {}
      const text =
        data.textMessageData?.textMessage ||
        data.extendedTextMessageData?.text ||
        ''

      const incomingChatId =
        body.senderData?.chatId || body.chatId || ''

      if (!incomingChatId || !text) {
        if (notification.receiptId) {
          await fetch(apiUrl(`deleteNotification/${notification.receiptId}`, config), {
            method: 'DELETE'
          })
        }
        return
      }

      setChats(prev => {
        const next = { ...prev }
        if (!next[incomingChatId]) {
          next[incomingChatId] = []
        }

        next[incomingChatId] = [
          ...next[incomingChatId],
          {
            id: notification.receiptId || crypto.randomUUID(),
            text,
            incoming: true,
            time: new Date()
          }
        ]

        return next
      })

      if (notification.receiptId) {
        await fetch(apiUrl(`deleteNotification/${notification.receiptId}`, config), {
          method: 'DELETE'
        })
      }
    } catch (e) {
      setError(e.message)
    } finally {
      pollingRef.current = false
    }
  }, [canConnect, config])

  const submitLogin = (e) => {
    e.preventDefault()
    const instanceId = config.instanceId.trim()
    const token = config.token.trim()

    if (!instanceId || !token) {
      setError('Введите idInstance и apiTokenInstance')
      return
    }

    localStorage.setItem('green_instance_id', instanceId)
    localStorage.setItem('green_token', token)

    setSettingsOpen(false)
    setError('')
  }

  const sendMessage = async (e) => {
    e.preventDefault()
    if (!canConnect) {
      setError('Сначала подключитесь к GREEN-API')
      return
    }

    const text = draft.trim()
    if (!text || !activeChatId) {
      setError('Введите сообщение и откройте чат')
      return
    }

    setSending(true)
    setError('')

    try {
      const response = await fetch(apiUrl('sendMessage', config), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId: activeChatId,
          message: text
        })
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Ошибка отправки: ${response.status}. ${errorText || 'empty response'}`)
      }

      setChats(prev => {
        const next = { ...prev }
        if (!next[activeChatId]) next[activeChatId] = []
        next[activeChatId] = [
          ...next[activeChatId],
          {
            id: crypto.randomUUID(),
            text,
            incoming: false,
            time: new Date()
          }
        ]
        return next
      })

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
        <button
          type="button"
          className="settings-button"
          onClick={() => setSettingsOpen(true)}
        >
          ⚙
        </button>
      </header>

      <main className="workspace">
        <aside className="sidebar">
          <div className="profile">
            <div className="avatar">M</div>
            <div>
              <strong>Мои чаты</strong>
              <small className={canConnect ? 'online' : ''}>{status}</small>
            </div>
          </div>

          <div className="new-chat-box">
            <input
              value={phoneInput}
              onChange={e => setPhoneInput(e.target.value)}
              placeholder="Номер получателя"
            />
            <button
              type="button"
              onClick={() => createOrOpenChat(phoneInput)}
            >
              Новый чат
            </button>
          </div>

          <div className="chat-list">
            {chatList.length === 0 && (
              <p className="empty-list">Нажмите «Новый чат» и введите номер получателя</p>
            )}

            {chatList.map(chatId => (
              <button
                key={chatId}
                type="button"
                className={`chat-item ${chatId === activeChatId ? 'active' : ''}`}
                onClick={() => setActiveChatId(chatId)}
              >
                <div className="avatar small">{chatId.slice(0, 1).toUpperCase()}</div>
                <div className="chat-item-text">
                  <strong>{chatId}</strong>
                  <small>
                    {chats[chatId]?.at(-1)?.text || 'Начните диалог'}
                  </small>
                </div>
              </button>
            ))}
          </div>
        </aside>

        <section className="conversation">
          {!activeChatId ? (
            <div className="empty-state">
              <div className="welcome-icon">M</div>
              <h2>Ваши сообщения</h2>
              <p>Создайте чат и начните переписку</p>
            </div>
          ) : (
            <>
              <div className="conversation-head">
                <div className="avatar small">{activeChatId.slice(0, 1).toUpperCase()}</div>
                <div>
                  <strong>{activeChatId}</strong>
                  <small>MAX • текстовые сообщения</small>
                </div>
              </div>

              <div className="message-area">
                {activeMessages.length === 0 && (
                  <div className="welcome">
                    <div className="welcome-icon">M</div>
                    <h2>Начните общение</h2>
                    <p>Отправьте первое сообщение</p>
                  </div>
                )}

                {activeMessages.map(msg => (
                  <div
                    key={msg.id}
                    className={`message-row ${msg.incoming ? 'incoming' : 'outgoing'}`}
                  >
                    <div className="message">
                      <span>{msg.text}</span>
                      <small>{formatTime(msg.time)} {!msg.incoming && '✓'}</small>
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
                <button
                  type="submit"
                  disabled={!canConnect || !draft.trim() || sending}
                >
                  ➤
                </button>
              </form>
            </>
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
          <form className="modal" onSubmit={submitLogin}>
            <button
              type="button"
              className="close"
              onClick={() => {
                if (!canConnect) return
                setSettingsOpen(false)
              }}
            >
              ×
            </button>

            <h2>GREEN-API</h2>
            <p>Введите учетные данные для MAX</p>

            <label>
              idInstance
              <input
                value={config.instanceId}
                onChange={e => setConfig({ ...config, instanceId: e.target.value })}
                required
              />
            </label>

            <label>
              apiTokenInstance
              <input
                type="password"
                value={config.token}
                onChange={e => setConfig({ ...config, token: e.target.value })}
                required
              />
            </label>

            <button type="submit" className="primary">
              Подключиться
            </button>

            <small className="hint">
              Для учебного MVP данные сохраняются в localStorage.
              Для production лучше использовать backend proxy.
            </small>
          </form>
        </div>
      )}
    </div>
  )
}