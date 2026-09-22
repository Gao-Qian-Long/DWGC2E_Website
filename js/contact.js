(() => {
  const site = window.QLCAD_SITE || {};
  const form = document.querySelector('#feedbackForm');
  const message = document.querySelector('#feedbackMessage');
  const email = document.querySelector('#contactEmail');
  if (email && site.contactEmail) { email.textContent = site.contactEmail; email.classList.add('is-configured'); }
  if (!form || !message) return;
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    if (!/^\S+@\S+\.\S+$/.test(data.email || '') || String(data.message || '').trim().length < 1) {
      message.textContent = '请填写有效邮箱，并填写问题描述。'; message.className = 'form-message error'; return;
    }
    const button = form.querySelector('button[type="submit"]'); button.disabled = true; button.textContent = '提交中…';
    try {
      if (!window.QLCAD_API) throw new Error('feedback_not_configured');
      await window.QLCAD_API.feedback.submit(data);
      form.reset(); message.textContent = '反馈已提交，感谢你的帮助。'; message.className = 'form-message';
    } catch (error) {
      message.textContent = error.message === 'feedback_not_configured' ? '反馈接口尚未开放，请暂时保留截图并等待客服邮箱公布。' : (error.message || '提交失败，请稍后重试。');
      message.className = 'form-message error';
    } finally { button.disabled = false; button.textContent = '提交反馈'; }
  });
})();
