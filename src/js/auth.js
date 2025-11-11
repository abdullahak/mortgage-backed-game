// Authentication functions

// Show auth tab
function showAuthTab(tabName) {
    // Hide all forms
    document.querySelectorAll('.auth-form').forEach(form => {
        form.classList.remove('active');
    });

    // Remove active class from all tabs
    document.querySelectorAll('.auth-tab').forEach(tab => {
        tab.classList.remove('active');
    });

    // Show selected form and tab
    document.getElementById(`${tabName}-form`).classList.add('active');
    event.target.classList.add('active');

    // Clear error messages
    document.getElementById('login-error').classList.remove('active');
    document.getElementById('signup-error').classList.remove('active');
}

// Handle login
async function handleLogin() {
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const errorEl = document.getElementById('login-error');

    if (!email || !password) {
        errorEl.textContent = 'Please enter both email and password';
        errorEl.classList.add('active');
        return;
    }

    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
        });

        if (error) throw error;

        // Redirect to lobby
        window.location.href = 'lobby.html';
    } catch (error) {
        errorEl.textContent = error.message || 'Login failed';
        errorEl.classList.add('active');
        console.error('Login error:', error);
    }
}

// Handle signup
async function handleSignup() {
    const name = document.getElementById('signup-name').value.trim();
    const email = document.getElementById('signup-email').value.trim();
    const password = document.getElementById('signup-password').value;
    const errorEl = document.getElementById('signup-error');

    if (!name || !email || !password) {
        errorEl.textContent = 'Please fill in all fields';
        errorEl.classList.add('active');
        return;
    }

    if (password.length < 6) {
        errorEl.textContent = 'Password must be at least 6 characters';
        errorEl.classList.add('active');
        return;
    }

    try {
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    display_name: name
                }
            }
        });

        if (error) throw error;

        // Check if email confirmation is required
        if (data.user && !data.session) {
            alert('Please check your email to confirm your account!');
        } else {
            // Redirect to lobby
            window.location.href = 'lobby.html';
        }
    } catch (error) {
        errorEl.textContent = error.message || 'Signup failed';
        errorEl.classList.add('active');
        console.error('Signup error:', error);
    }
}

// Handle password reset
async function handlePasswordReset() {
    const email = prompt('Enter your email address:');

    if (!email) return;

    try {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: window.location.origin + '/auth.html'
        });

        if (error) throw error;

        alert('Password reset email sent! Please check your inbox.');
    } catch (error) {
        alert('Error: ' + error.message);
        console.error('Password reset error:', error);
    }
}

// Check if user is already logged in
async function checkAuth() {
    const { data: { session } } = await supabase.auth.getSession();

    if (session) {
        // User is logged in, redirect to lobby
        window.location.href = 'lobby.html';
    }
}

// Run auth check on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkAuth);
} else {
    checkAuth();
}

// Handle Enter key on forms
document.addEventListener('DOMContentLoaded', () => {
    // Login form
    ['login-email', 'login-password'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') handleLogin();
            });
        }
    });

    // Signup form
    ['signup-name', 'signup-email', 'signup-password'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') handleSignup();
            });
        }
    });
});
