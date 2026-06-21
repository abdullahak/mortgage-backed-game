function normalizeEmail(email) {
    return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

function isValidEmail(email) {
    return email.includes('@');
}

function normalizeInviteCode(code) {
    return String(code || '').trim().toUpperCase();
}

module.exports = {
    normalizeEmail,
    isValidEmail,
    normalizeInviteCode,
};
