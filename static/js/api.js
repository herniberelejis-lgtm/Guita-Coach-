/* Thin fetch wrapper. All calls go through here. */
const API = {
  async _req(method, path, body) {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const res = await fetch('/api' + path, opts);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'Error del servidor');
    }
    return res.status === 204 ? null : res.json();
  },

  get:    (path)        => API._req('GET',    path),
  post:   (path, body)  => API._req('POST',   path, body),
  patch:  (path, body)  => API._req('PATCH',  path, body),
  delete: (path)        => API._req('DELETE', path),

  // Budget
  getBudget:           () => API.get('/budget/current'),
  getBudgetHistory:    () => API.get('/budget/history'),
  getInsights:         () => API.get('/insights/month'),
  postOnboarding:      (d) => API.post('/budget/onboarding', d),
  patchBudgetSettings: (d) => API.patch('/budget/settings', d),
  markAlertRead:       (id) => API.post(`/budget/alerts/${id}/read`),

  // Transactions
  getTransactions: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return API.get('/transactions' + (q ? '?' + q : ''));
  },
  getNeedsReview:    () => API.get('/transactions/needs-review'),
  addTransaction:    (d) => API.post('/transactions', d),
  correctCategory:   (id, d) => API.patch(`/transactions/${id}/category`, d),
  confirmSplit:      (id, d) => API.post(`/transactions/${id}/split-confirm`, d),
  deleteTransaction: (id) => API.delete(`/transactions/${id}`),

  // Sync
  syncGmail:  () => API.post('/sync/gmail'),
  syncMP:     () => API.post('/sync/mp'),
  syncStatus: () => API.get('/sync/status'),

  // Auth
  register: (d) => API.post('/auth/register', d),
  login:    (d) => API.post('/auth/login', d),
  logout:   ()  => API.post('/auth/logout'),
  me:       ()  => API.get('/auth/me'),
  disconnectProvider: (p) => API.post(`/auth/disconnect/${p}`),

  // Chat
  getChatStarters: () => API.get('/chat/starters'),
  sendChat: (d) => API.post('/chat', d),

  // Goals + recurring + dolar
  getGoals:        ()       => API.get('/goals'),
  createGoal:      (d)      => API.post('/goals', d),
  contributeGoal:  (id, a)  => API.post(`/goals/${id}/contribute`, { amount: a }),
  deleteGoal:      (id)     => API.delete(`/goals/${id}`),
  getRecurring:    ()       => API.get('/goals/recurring'),
  createRecurring: (d)      => API.post('/goals/recurring', d),
  deleteRecurring: (id)     => API.delete(`/goals/recurring/${id}`),
  getDolar:        ()       => API.get('/insights/dolar'),
  getCategories:   (month)  => API.get('/insights/categories' + (month ? '?month=' + month : '')),
};
