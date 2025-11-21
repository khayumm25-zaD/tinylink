// public/main.js
document.addEventListener('DOMContentLoaded', () => {
  const createForm = document.getElementById('create-form');
  const messageEl = document.getElementById('create-message');

  if (createForm) {
    createForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (messageEl) {
        messageEl.textContent = '';
        messageEl.className = 'form-message';
      }

      const submitBtn = createForm.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;

      const formData = new FormData(createForm);
      const url = formData.get('url');
      const code = formData.get('code');

      try {
        const res = await fetch('/api/links', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, code }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          if (messageEl) {
            messageEl.textContent = data.error || 'Error creating link';
            messageEl.classList.add('error');
          }
        } else {
          if (messageEl) {
            messageEl.textContent = 'Link created successfully!';
            messageEl.classList.add('success');
          }
          createForm.reset();
          // reload to show the new link
          window.location.reload();
        }
      } catch (err) {
        console.error(err);
        if (messageEl) {
          messageEl.textContent = 'Network error';
          messageEl.classList.add('error');
        }
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  // Copy buttons
  document.querySelectorAll('.copy-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const url = btn.getAttribute('data-url');
      if (!url) return;
      try {
        await navigator.clipboard.writeText(url);
        const original = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => {
          btn.textContent = original || 'Copy';
        }, 1500);
      } catch (err) {
        console.error('Copy failed', err);
      }
    });
  });

  // Delete buttons
  document.querySelectorAll('.delete-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const code = btn.getAttribute('data-code');
      if (!code) return;
      if (!confirm(`Delete link with code "${code}"?`)) return;

      try {
        const res = await fetch(`/api/links/${code}`, {
          method: 'DELETE',
        });

        if (res.status === 204) {
          window.location.reload();
        } else {
          alert('Error deleting link');
        }
      } catch (err) {
        console.error(err);
        alert('Network error');
      }
    });
  });
});