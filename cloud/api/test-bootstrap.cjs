// tsx asks Node for the current Unix user id before loading tests. Windows does
// not expose geteuid(), so tsx falls back to os.userInfo(), which is unavailable
// in some locked-down build agents. A stable test-only uid keeps its temp path
// local and does not alter application authentication or authorization.
if (typeof process.geteuid !== 'function') {
  process.geteuid = () => 0;
}
