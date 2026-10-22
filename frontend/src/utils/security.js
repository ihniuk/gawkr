export function evaluatePasswordStrength(password = '') {
  if (!password) {
    return {
      score: 0,
      label: 'Too Short',
      color: 'var(--text-muted)',
      valid: false,
      hasMinLength: false,
      hasLetter: false,
      hasDigit: false,
      hasSpecial: false,
      message: 'Minimum 8 characters with at least one letter and one number'
    };
  }

  const hasMinLength = password.length >= 8;
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasDigit = /[0-9]/.test(password);
  const hasSpecial = /[^a-zA-Z0-9]/.test(password);
  const isLong = password.length >= 12;

  let score = 0;
  if (hasMinLength) score += 1;
  if (hasLetter && hasDigit) score += 1;
  if (isLong) score += 1;
  if (hasSpecial) score += 1;

  const valid = hasMinLength && hasLetter && hasDigit;

  let label = 'Weak';
  let color = '#fb7185'; // rose

  if (!valid) {
    label = 'Weak';
    color = '#fb7185';
  } else if (score >= 3) {
    label = 'Strong';
    color = 'var(--accent-emerald)';
  } else {
    label = 'Good';
    color = 'var(--accent-cyan)';
  }

  let message = '';
  if (!hasMinLength) {
    message = 'At least 8 characters required';
  } else if (!hasLetter) {
    message = 'Must include at least 1 letter';
  } else if (!hasDigit) {
    message = 'Must include at least 1 number';
  }

  return {
    score,
    label,
    color,
    valid,
    hasMinLength,
    hasLetter,
    hasDigit,
    hasSpecial,
    message
  };
}
