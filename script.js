(function () {
  'use strict';

  var chatMessages = document.getElementById('chat-messages');
  var form = document.getElementById('question-form');
  var textarea = document.getElementById('message-input');
  var statusEl = document.getElementById('input-status');

  // --- Load and Render Posts ---

  function loadPosts() {
    fetch('posts.json')
      .then(function (res) { return res.json(); })
      .then(function (data) {
        renderMessages(data.posts || []);
        scrollToBottom();
      })
      .catch(function () {
        chatMessages.innerHTML =
          '<p style="text-align:center;color:var(--text-secondary);padding:40px 0;">Could not load posts.</p>';
      });
  }

  function renderMessages(posts) {
    var html = '';
    var lastDate = '';

    for (var i = 0; i < posts.length; i++) {
      var post = posts[i];

      if (post.date !== lastDate) {
        html += dateSeparator(post.date);
        lastDate = post.date;
      }

      html += messagePair(post);
    }

    chatMessages.innerHTML = html;
  }

  function dateSeparator(dateStr) {
    var formatted = formatDate(dateStr);
    return '<div class="date-separator"><span>' + escapeHtml(formatted) + '</span></div>';
  }

  function messagePair(post) {
    return (
      '<div class="message-pair">' +
        '<div class="message-user">' +
          '<div class="message-bubble">' + renderMarkdown(post.question) + '</div>' +
        '</div>' +
        '<div class="message-assistant">' +
          '<div class="message-body">' + renderMarkdown(post.answer) + '</div>' +
        '</div>' +
      '</div>'
    );
  }

  function pendingMessage(question) {
    return (
      '<div class="message-pair">' +
        '<div class="message-user">' +
          '<div class="message-bubble">' + escapeHtml(question) + '</div>' +
        '</div>' +
        '<div class="message-assistant message-pending">' +
          '<div class="message-body"><p><span class="thinking-dots">Thinking</span></p></div>' +
        '</div>' +
      '</div>'
    );
  }

  // --- Markdown ---

  function renderMarkdown(src) {
    var html = '';
    var lines = src.split('\n');
    var i = 0;

    while (i < lines.length) {
      var line = lines[i];

      // Blank line — skip
      if (line.trim() === '') { i++; continue; }

      // Unordered list
      if (/^[\-\*] /.test(line.trim())) {
        html += '<ul>';
        while (i < lines.length && /^[\-\*] /.test(lines[i].trim())) {
          html += '<li>' + inline(lines[i].trim().replace(/^[\-\*] /, '')) + '</li>';
          i++;
        }
        html += '</ul>';
        continue;
      }

      // Ordered list
      if (/^\d+\. /.test(line.trim())) {
        html += '<ol>';
        while (i < lines.length && /^\d+\. /.test(lines[i].trim())) {
          html += '<li>' + inline(lines[i].trim().replace(/^\d+\. /, '')) + '</li>';
          i++;
        }
        html += '</ol>';
        continue;
      }

      // Headings
      var headingMatch = line.match(/^(#{1,3}) (.+)$/);
      if (headingMatch) {
        var level = headingMatch[1].length + 1; // h2-h4 to keep hierarchy under page h1
        html += '<h' + level + '>' + inline(headingMatch[2]) + '</h' + level + '>';
        i++;
        continue;
      }

      // Paragraph — collect consecutive non-blank, non-special lines
      var para = '';
      while (i < lines.length && lines[i].trim() !== '' &&
             !/^[\-\*] /.test(lines[i].trim()) &&
             !/^\d+\. /.test(lines[i].trim()) &&
             !/^#{1,3} /.test(lines[i])) {
        if (para) para += ' ';
        para += lines[i];
        i++;
      }
      html += '<p>' + inline(para) + '</p>';
    }

    return html;
  }

  function inline(text) {
    return text
      // Code (backticks) — process first to protect contents
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      // Bold
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      // Italic
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      // Links
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  }

  // --- Utilities ---

  function formatDate(dateStr) {
    var parts = dateStr.split('-');
    var date = new Date(
      parseInt(parts[0], 10),
      parseInt(parts[1], 10) - 1,
      parseInt(parts[2], 10)
    );
    var months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    return months[date.getMonth()] + ' ' + date.getDate() + ', ' + date.getFullYear();
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  function scrollToBottom() {
    requestAnimationFrame(function () {
      window.scrollTo(0, document.body.scrollHeight);
    });
  }

  // --- Textarea Auto-Resize ---

  function autoResize() {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
  }

  textarea.addEventListener('input', autoResize);

  // --- Keyboard: Enter to Submit, Shift+Enter for Newline ---

  textarea.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (textarea.value.trim()) {
        form.requestSubmit();
      }
    }
  });

  // --- Form Submission ---

  form.addEventListener('submit', function (e) {
    e.preventDefault();

    var question = textarea.value.trim();
    if (!question) return;

    var formData = new FormData(form);

    // Clear input immediately
    textarea.value = '';
    autoResize();
    statusEl.textContent = '';

    // Submit to Formspree
    fetch(form.action, {
      method: 'POST',
      body: formData,
      headers: { 'Accept': 'application/json' }
    })
      .then(function (res) {
        if (res.ok) {
          statusEl.textContent = 'Submitted. Check back later for a response.';
        } else {
          statusEl.textContent = 'Something went wrong. Try again.';
        }
      })
      .catch(function () {
        statusEl.textContent = 'Something went wrong. Try again.';
      });
  });

  // --- Init ---

  loadPosts();
})();
