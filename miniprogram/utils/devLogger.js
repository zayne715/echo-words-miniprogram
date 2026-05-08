function stringifyError(err) {
  if (!err) return "";
  if (err instanceof Error) return err.stack || err.message || String(err);
  return String(err);
}

function warn(scope, message, err) {
  try {
    const detail = stringifyError(err);
    if (detail) {
      console.warn(`[${scope}] ${message}`, detail);
    } else {
      console.warn(`[${scope}] ${message}`);
    }
  } catch (e) {}
}

module.exports = {
  warn,
};
