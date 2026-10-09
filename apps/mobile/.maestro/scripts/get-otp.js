// Busca o último código de login na caixa de e-mail local do Supabase (Mailpit/Inbucket em :54324).
// Só funciona com `supabase start` rodando na sua máquina.
const base = MAILBOX_URL || 'http://localhost:54324';
const list = json(http.get(`${base}/api/v1/messages?limit=1`).body);
const id = list.messages[0].ID;
const msg = json(http.get(`${base}/api/v1/message/${id}`).body);
const match = (msg.Text || msg.HTML).match(/\b(\d{6})\b/);
output.otp = match[1];
