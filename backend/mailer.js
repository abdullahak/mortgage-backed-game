async function sendEmail(to, subject, text, html) {
    const apiKey = process.env.USESEND_API_KEY;
    const url = process.env.USESEND_URL || 'http://127.0.0.1:3001/api/v1/emails';
    if (!apiKey) return;
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            from: process.env.SMTP_FROM || 'noreply@abdlh.com',
            to: [to],
            subject,
            text,
            html
        })
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`UseSend error: ${err}`);
    }
}

module.exports = { sendEmail };
