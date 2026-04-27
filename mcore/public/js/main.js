/* M-CORE VISION — shared client-side logic */

(function () {
  // ================================================================
  //  EmailJS Configuration
  //  ---------------------------------------------------------------
  //  1. Sign up free at https://www.emailjs.com
  //  2. Add Gmail service (mcorevisionpvt@gmail.com) → copy Service ID
  //  3. Create template "notification" (sends form data to you):
  //       Subject: New {{form_type}} enquiry from {{from_name}}
  //       Body:
  //         Name: {{from_name}}
  //         Email: {{from_email}}
  //         Phone: {{phone}}
  //         Company: {{company}}
  //         Subject: {{subject}}
  //         Message: {{message}}
  //         Interest/Role: {{interest}}
  //         Experience: {{experience}}
  //         Portfolio: {{resume}}
  //         Source: {{source}}
  //         Submitted at: {{submitted_at}}
  //
  //  4. Create template "auto_reply" (thank-you to the user):
  //       To: {{from_email}}
  //       Subject: Thank you for reaching out — M-CORE VISION
  //       Body:
  //         Hi {{from_name}},
  //
  //         Thank you for contacting M-CORE VISION PRIVATE LIMITED.
  //         We have received your {{form_type}} enquiry and our team
  //         will get back to you within 1 business day.
  //
  //         Warm regards,
  //         Team M-CORE VISION
  //         mcorevisionpvt@gmail.com | +91 85010 20366
  //
  //  5. Copy your Public Key from Account → API Keys
  //  6. Replace the three values below:
  // ================================================================

  const EMAILJS_PUBLIC_KEY = 'aw6ODQP0Pv8UmZW8j';
  const EMAILJS_SERVICE_ID = 'service_zspvral';
  const EMAILJS_NOTIFY_TEMPLATE = 'template_ypb2d5d';
  const EMAILJS_REPLY_TEMPLATE = 'template_wg7tj4n';

  // Initialise EmailJS (only if the library is loaded and keys are set)
  let emailjsReady = false;
  if (typeof emailjs !== 'undefined' && EMAILJS_PUBLIC_KEY !== 'YOUR_PUBLIC_KEY') {
    emailjs.init(EMAILJS_PUBLIC_KEY);
    emailjsReady = true;
  }

  // ----------------------------------------------------------------
  //  Mobile nav toggle
  // ----------------------------------------------------------------
  const toggle = document.querySelector('.nav-toggle');
  const links = document.querySelector('.nav-links');
  if (toggle && links) {
    toggle.addEventListener('click', () => links.classList.toggle('open'));
    links.querySelectorAll('a').forEach((a) => {
      a.addEventListener('click', () => links.classList.remove('open'));
    });
  }

  // ----------------------------------------------------------------
  //  Active nav highlighting
  // ----------------------------------------------------------------
  const currentPath = window.location.pathname.replace(/\/$/, '') || '/index.html';
  document.querySelectorAll('.nav-links a').forEach((a) => {
    const href = a.getAttribute('href');
    if (!href) return;
    if (href === currentPath || (href === '/index.html' && currentPath === '/')) {
      a.classList.add('active');
    }
  });

  // ----------------------------------------------------------------
  //  Scroll reveal
  // ----------------------------------------------------------------
  const revealEls = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && revealEls.length) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('in');
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12 }
    );
    revealEls.forEach((el) => io.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add('in'));
  }

  // ----------------------------------------------------------------
  //  Dynamic year
  // ----------------------------------------------------------------
  const yearEls = document.querySelectorAll('[data-year]');
  yearEls.forEach((el) => (el.textContent = new Date().getFullYear()));

  // ----------------------------------------------------------------
  //  Form submission — EmailJS + JSON backup
  // ----------------------------------------------------------------
  document.querySelectorAll('form[data-mc-form]').forEach((form) => {
    const status = form.querySelector('.form-status');
    const submitBtn = form.querySelector('button[type="submit"]');

    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();

      // Reset status
      if (status) {
        status.className = 'form-status';
        status.textContent = '';
      }

      // Gather form data
      const formData = new FormData(form);
      const payload = {};
      formData.forEach((v, k) => (payload[k] = (v || '').toString()));
      payload.type = payload.type || form.dataset.mcForm || 'contact';

      // Disable button
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.dataset.originalText = submitBtn.textContent;
        submitBtn.textContent = 'Sending…';
      }

      // Build EmailJS template params (common across all forms)
      const templateParams = {
        form_type: payload.type,
        from_name: payload.name || '',
        from_email: payload.email || '',
        phone: payload.phone || 'Not provided',
        company: payload.company || 'Not provided',
        subject: payload.subject || payload.role || payload.interest || 'General enquiry',
        message: payload.message || 'No message provided.',
        interest: payload.interest || payload.role || 'Not specified',
        experience: payload.experience || 'Not provided',
        resume: payload.resume || 'Not provided',
        source: payload.source || 'Not specified',
        submitted_at: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
      };

      try {
        // ---- Step 1: Send via EmailJS (notification + auto-reply) ----
        if (emailjsReady) {
          // Send notification email to mcorevisionpvt@gmail.com
          await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_NOTIFY_TEMPLATE, templateParams);

          // Send auto-reply thank-you email to the user
          try {
            await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_REPLY_TEMPLATE, templateParams);
          } catch (replyErr) {
            // Auto-reply failure is non-critical; log but don't block
            console.warn('Auto-reply email failed:', replyErr);
          }
        }

        // ---- Step 2: Also save to JSON database (backup) ----
        try {
          await fetch('/api/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
        } catch (backupErr) {
          // JSON backup failure is non-critical when EmailJS succeeds
          console.warn('JSON backup failed:', backupErr);
        }

        // ---- Success ----
        if (status) {
          status.className = 'form-status ok';
          status.textContent = emailjsReady
            ? 'Thank you! We\'ve received your message and sent a confirmation to your email. We\'ll be in touch within 1 business day.'
            : 'Thank you! We\'ve received your message and will be in touch shortly.';
        }
        form.reset();

      } catch (err) {
        console.error('Form submission error:', err);

        // If EmailJS failed, try JSON-only as fallback
        if (emailjsReady) {
          try {
            const res = await fetch('/api/submit', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            });
            const out = await res.json().catch(() => ({}));
            if (res.ok && out.ok) {
              if (status) {
                status.className = 'form-status ok';
                status.textContent = 'Thank you! We\'ve received your message. Our team will contact you shortly.';
              }
              form.reset();
              return;
            }
          } catch (_) { /* both failed */ }
        }

        if (status) {
          status.className = 'form-status err';
          status.textContent = 'Something went wrong. Please try again or email us directly at mcorevisionpvt@gmail.com';
        }
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = submitBtn.dataset.originalText || 'Submit';
        }
      }
    });
  });
})();
