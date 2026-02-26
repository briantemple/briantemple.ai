(function () {
  'use strict';

  var chatMessages = document.getElementById('chat-messages');
  var form = document.getElementById('question-form');
  var textarea = document.getElementById('message-input');
  var statusEl = document.getElementById('input-status');

  var inputArea = document.querySelector('.input-area');
  var prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // --- Load and Render Posts ---

  function loadPosts() {
    fetch('posts.json')
      .then(function (res) { return res.json(); })
      .then(function (data) {
        var posts = data.posts || [];
        if (prefersReducedMotion) {
          renderMessagesImmediate(posts);
        } else {
          animateIntro(posts);
        }
      })
      .catch(function () {
        chatMessages.innerHTML =
          '<p style="text-align:center;color:var(--text-secondary);padding:40px 0;">Could not load posts.</p>';
        showInputArea();
      });
  }

  function renderMessagesImmediate(posts) {
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
    scrollToBottom();
    showInputArea();
  }

  function showInputArea() {
    inputArea.classList.add('visible');
  }

  function delay(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function appendElement(html, parent) {
    var wrapper = document.createElement('div');
    wrapper.innerHTML = html;
    var el = wrapper.firstElementChild;
    el.classList.add('fade-in');
    parent.appendChild(el);
    // Force layout so the transition triggers
    el.offsetHeight; // eslint-disable-line no-unused-expressions
    el.classList.add('visible');
    return el;
  }

  function animateIntro(posts) {
    var lastDate = '';
    var chain = Promise.resolve();
    var introCount = 0;
    while (introCount < posts.length && posts[introCount].intro) introCount++;
    var animated = posts.slice(0, introCount);
    var remaining = posts.slice(introCount);

    for (var i = 0; i < animated.length; i++) {
      (function (post) {
        chain = chain.then(function () {
          // Track date but skip separator during intro
          lastDate = post.date;

          // Message pair container
          var pairEl = appendElement(
            '<div class="message-pair"></div>',
            chatMessages
          );

          // Question bubble
          appendElement(
            '<div class="message-user">' +
              '<div class="message-bubble">' + renderMarkdown(post.question) + '</div>' +
            '</div>',
            pairEl
          );
          scrollToBottom();

          return delay(400);
        }).then(function () {
          // Find the pair we just created (last .message-pair)
          var pairs = chatMessages.querySelectorAll('.message-pair');
          var pairEl = pairs[pairs.length - 1];

          // Answer container with pre-rendered markdown
          var answerEl = document.createElement('div');
          answerEl.className = 'message-assistant fade-in';
          answerEl.innerHTML = '<div class="message-body">' + renderMarkdown(post.answer) + '</div>';
          pairEl.appendChild(answerEl);
          answerEl.offsetHeight;
          answerEl.classList.add('visible');
          scrollToBottom();

          var bodyEl = answerEl.querySelector('.message-body');

          // Collect all text nodes, store their full text, then empty them
          var textNodes = [];
          var fullTexts = [];
          (function walk(node) {
            if (node.nodeType === 3) {
              textNodes.push(node);
              fullTexts.push(node.nodeValue);
              node.nodeValue = '';
            } else {
              for (var c = node.firstChild; c; c = c.nextSibling) walk(c);
            }
          })(bodyEl);

          // Append cursor after last text node
          var cursor = document.createElement('span');
          cursor.className = 'streaming-cursor';
          bodyEl.appendChild(cursor);

          // Reveal one character at a time across text nodes
          var nodeIdx = 0;
          var charIdx = 0;
          return new Promise(function (resolve) {
            function tick() {
              if (nodeIdx < textNodes.length) {
                charIdx++;
                textNodes[nodeIdx].nodeValue = fullTexts[nodeIdx].slice(0, charIdx);
                // Move cursor next to the active text node
                textNodes[nodeIdx].parentNode.appendChild(cursor);
                if (charIdx >= fullTexts[nodeIdx].length) {
                  nodeIdx++;
                  charIdx = 0;
                }
                scrollToBottom();
                setTimeout(tick, 30);
              } else {
                cursor.remove();
                scrollToBottom();
                resolve();
              }
            }
            tick();
          });
        }).then(function () {
          return delay(300);
        });
      })(animated[i]);
    }

    // After animated posts, fade in the rest + input area, then smooth-scroll
    chain.then(function () {
      var html = '';
      for (var j = 0; j < remaining.length; j++) {
        var post = remaining[j];

        if (post.date !== lastDate) {
          html += dateSeparator(post.date);
          lastDate = post.date;
        }

        html += messagePair(post);
      }

      if (html) {
        var batch = document.createElement('div');
        batch.innerHTML = html;
        batch.classList.add('fade-in');
        chatMessages.appendChild(batch);
        batch.offsetHeight;
        batch.classList.add('visible');
      }

      showInputArea();

      // Smooth-scroll to bottom after fade completes
      setTimeout(function () {
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
      }, 350);
    });
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
