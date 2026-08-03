const isValidUsername = (username) =>
  typeof username === "string" &&
  username.length > 0 &&
  username.length <= 32 &&
  /^[a-zA-Z0-9_.\-À-ÖØ-öø-ÿ]+$/.test(username);

module.exports = { isValidUsername };
