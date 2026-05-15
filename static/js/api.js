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
  deleteTransaction: (id) => API.delete(`/transactions/${id}`),

  // Sync
  syncGmail:  () => API.post('/sync/gmail'),
  syncMP:     () => API.post('/sync/mp'),
  syncStatus: () => API.get('/sync/status'),

  // Auth
  disconnectProvider: (p) => API.post(`/auth/disconnect/${p}`),
};
