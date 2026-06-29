import { tool } from "@opencode-ai/plugin"

export default tool({
  description: "Send a message to your Telegram",
  args: {
    message: tool.schema.string().describe("Message text to send"),
  },
  async execute(args) {
    const token = process.env.TELEGRAM_BOT_TOKEN
    const chatId = process.env.TELEGRAM_CHAT_ID
    const url = `https://api.telegram.org/bot${token}/sendMessage`
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: args.message }),
    })
    return res.ok ? "Message sent" : `Failed: ${await res.text()}`
  },
})