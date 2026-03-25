// Authentication — OTP code verification

let currentEmail = '';

async function handleSendCode() {
    const email = document.getElementById('email-input').value.trim();
    const errorEl = document.getElementById('email-error');

    if (!email) {
        errorEl.textContent = 'Please enter your email address';
        errorEl.classList.add('active');
        return;
    }

    const btn = document.getElementById('send-code-btn');
    btn.disabled = true;
    btn.textContent = 'Sending...';
    errorEl.classList.remove('active');

    try {
        await apiFetch('/auth/send-otp', {
            method: 'POST',
            body: JSON.stringify({ email })
        });

        currentEmail = email;
        document.getElementById('sent-to-email').textContent = email;
        document.getElementById('step-email').style.display = 'none';
        document.getElementById('step-code').style.display = 'block';
        document.getElementById('code-input').focus();

    } catch (error) {
        errorEl.textContent = error.message || 'Failed to send code. Please try again.';
        errorEl.classList.add('active');
        btn.disabled = false;
        btn.textContent = 'Send Code';
        console.error('Send code error:', error);
    }
}

async function handleVerifyCode() {
    const token = document.getElementById('code-input').value.trim();
    const errorEl = document.getElementById('code-error');

    if (!token) {
        errorEl.textContent = 'Please enter the 6-digit code';
        errorEl.classList.add('active');
        return;
    }

    const btn = document.getElementById('verify-code-btn');
    btn.disabled = true;
    btn.textContent = 'Verifying...';
    errorEl.classList.remove('active');

    try {
        const data = await apiFetch('/auth/verify-otp', {
            method: 'POST',
            body: JSON.stringify({ email: currentEmail, token })
        });

        localStorage.setItem('auth_token', data.token);
        window.location.href = 'lobby.html';

    } catch (error) {
        errorEl.textContent = error.message || 'Invalid or expired code. Please try again.';
        errorEl.classList.add('active');
        btn.disabled = false;
        btn.textContent = 'Verify Code';
        console.error('Verify code error:', error);
    }
}

function resetToEmail() {
    currentEmail = '';
    document.getElementById('step-code').style.display = 'none';
    document.getElementById('step-email').style.display = 'block';
    document.getElementById('code-input').value = '';
    document.getElementById('code-error').classList.remove('active');
    const btn = document.getElementById('send-code-btn');
    btn.disabled = false;
    btn.textContent = 'Send Code';
}

// If user is already authenticated, go straight to lobby
async function checkAuth() {
    const token = localStorage.getItem('auth_token');
    if (!token) return;
    try {
        const user = await apiFetch('/auth/me');
        if (user && !user.is_anonymous) {
            window.location.href = 'lobby.html';
        }
    } catch {
        localStorage.removeItem('auth_token');
    }
}

// Handle Enter key on both inputs
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('email-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleSendCode();
    });
    document.getElementById('code-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleVerifyCode();
    });

    checkAuth();
});
