// Authentication — magic link only (no password)

async function handleMagicLink() {
    const email = document.getElementById('magic-link-email').value.trim();
    const errorEl = document.getElementById('magic-link-error');

    if (!email) {
        errorEl.textContent = 'Please enter your email address';
        errorEl.classList.add('active');
        return;
    }

    const btn = document.getElementById('send-magic-link-btn');
    btn.disabled = true;
    btn.textContent = 'Sending...';
    errorEl.classList.remove('active');

    try {
        const { error } = await supabase.auth.signInWithOtp({
            email,
            options: {
                emailRedirectTo: window.location.origin + '/lobby.html'
            }
        });

        if (error) throw error;

        // Show success state
        document.getElementById('magic-link-form').style.display = 'none';
        document.getElementById('magic-link-sent').style.display = 'block';
        document.getElementById('sent-to-email').textContent = email;

    } catch (error) {
        errorEl.textContent = error.message || 'Failed to send magic link. Please try again.';
        errorEl.classList.add('active');
        btn.disabled = false;
        btn.textContent = 'Send Magic Link';
        console.error('Magic link error:', error);
    }
}

function resetForm() {
    document.getElementById('magic-link-form').style.display = 'block';
    document.getElementById('magic-link-sent').style.display = 'none';
    document.getElementById('magic-link-email').value = '';

    const btn = document.getElementById('send-magic-link-btn');
    btn.disabled = false;
    btn.textContent = 'Send Magic Link';
}

// If user is already authenticated, go straight to lobby
async function checkAuth() {
    const { data: { session } } = await supabase.auth.getSession();
    if (session && !session.user.is_anonymous) {
        window.location.href = 'lobby.html';
    }
}

// Handle Enter key
document.addEventListener('DOMContentLoaded', () => {
    const emailInput = document.getElementById('magic-link-email');
    if (emailInput) {
        emailInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleMagicLink();
        });
    }

    checkAuth();
});
