/* =========================================================================
   app.js — Robotic QA Laboratory
   Ubais Ahamed · QA Automation Engineer

   Layers, top to bottom:
     utils        pure maths helpers
     LabState     the single source of runtime truth
     Content      data -> HTML for the 2D sections
     UI           DOM wiring (dock, readout, panel, QA lab, terminal)
     RobotModel   visual robot, procedural (swappable for a GLB)
     RobotController  IK + joint damping, knows nothing about content
     Parcels      six physical cardboard parcels
     CameraRig    damped cinematic camera
     Lab          scene assembly + the pickup / return state machine
   ========================================================================= */
(function () {
  "use strict";

  var DATA = window.PORTFOLIO;

  /* ======================================================================
     1. UTILITIES
     ====================================================================== */
  var U = {
    clamp: function (v, a, b) { return v < a ? a : (v > b ? b : v); },
    lerp: function (a, b, t) { return a + (b - a) * t; },
    /* frame-rate independent damping */
    damp: function (cur, goal, lambda, dt) {
      return U.lerp(cur, goal, 1 - Math.exp(-lambda * dt));
    },
    dampV: function (vec, goal, lambda, dt) {
      var t = 1 - Math.exp(-lambda * dt);
      vec.x += (goal.x - vec.x) * t;
      vec.y += (goal.y - vec.y) * t;
      vec.z += (goal.z - vec.z) * t;
      return vec;
    },
    easeInOut: function (t) {
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    },
    easeOut: function (t) { return 1 - Math.pow(1 - t, 3); },
    esc: function (s) {
      return String(s).replace(/[&<>"']/g, function (c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
      });
    }
  };

  var REDUCED = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var IS_TOUCH = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
  var IS_SMALL = window.innerWidth < 860;

  /* ======================================================================
     2. CONFIG — no magic numbers scattered through the code
     ====================================================================== */
  var CFG = {
    robot: {
      base: { x: 0, y: 0, z: 0 },
      shoulderY: 0.95,
      l1: 1.10,          // shoulder -> elbow
      l2: 1.00,          // elbow -> wrist
      toolOffset: 0.42,  // wrist -> parcel anchor (tool points down)
      elbowSign: 1,   // solution branch that keeps every pose inside the joint limits
      limits: {          // radians
        j1: [-Math.PI, Math.PI],
        j2: [-0.55, 2.10],
        j3: [-2.55, 2.55],
        j4: [-1.6, 1.6],
        j5: [-2.70, 2.70],
        j6: [-2.4, 2.4]
      },
      damp: { idle: 4.2, sequence: 7.0 },
      maxJointSpeed: 2.9 // rad/s
    },
    staging: {
      angles: [0.244, 0.803, 1.361],  // 14deg, 46deg, 78deg
      radii: [1.30, 1.85],            // row 0 (inner/back), row 1 (outer/front)
      pedestal: { w: 0.66, h: 0.35, d: 0.66 },
      parcel: { w: 0.56, h: 0.38, d: 0.56 }
    },
    camera: {
      home: { pos: [2.00, 2.50, 5.15], look: [0.72, 0.72, 0.85] },
      homeSmall: { pos: [2.30, 2.95, 6.30], look: [0.80, 0.60, 0.85] },
      fov: IS_SMALL ? 52 : 42,
      damp: 2.6
    },
    workspace: { rMin: 0.72, rMax: 1.95, yMin: 0.45, yMax: 1.95 },
    gripper: { open: 0.375, closed: 0.292 },
    color: {
      floor: 0xdedbd4, floorLine: 0xe8590c, bg: 0xf1efea,
      metal: 0xb9bcc2, metalDark: 0x6a6e75, charcoal: 0x2a2c30,
      orange: 0xe8590c, cardboard: 0xc49a68, pedestal: 0x33363b
    }
  };

  /* Phase durations (seconds). Reduced motion collapses them. */
  var DUR = function (s) { return REDUCED ? Math.min(s, 0.12) : s; };

  /* ======================================================================
     3. LAB STATE — centralised, the only mutable truth
     ====================================================================== */
  var LabState = {
    currentMode: "BOOT",        // BOOT | IDLE | TARGETING | ... | CONTENT
    selectedParcel: null,       // Parcel instance
    originalParcelTransform: null,
    robotTarget: null,          // THREE.Vector3, anchor goal in world space
    cameraTarget: { pos: null, look: null },
    isGrabbing: false,
    isAttached: false,
    activeSection: null,        // section id string
    hovered: null,
    pointerEnabled: true,
    listeners: [],

    set: function (patch) {
      for (var k in patch) { if (patch.hasOwnProperty(k)) this[k] = patch[k]; }
      for (var i = 0; i < this.listeners.length; i++) this.listeners[i](this);
    },
    onChange: function (fn) { this.listeners.push(fn); },
    busy: function () {
      return this.currentMode !== "IDLE" && this.currentMode !== "CONTENT";
    }
  };

  /* ======================================================================
     4. CONTENT — data -> HTML. No copy lives in here.
     ====================================================================== */
  var Content = {
    list: function (arr, cls) {
      return '<ul class="chips' + (cls ? " " + cls : "") + '">' +
        arr.map(function (x) { return "<li>" + U.esc(x) + "</li>"; }).join("") + "</ul>";
    },
    links: function () {
      var l = DATA.links;
      return '<ul class="linklist">' +
        '<li><a href="' + l.github + '" target="_blank" rel="noopener">GitHub</a></li>' +
        '<li><a href="' + l.linkedin + '" target="_blank" rel="noopener">LinkedIn</a></li>' +
        '<li><a href="' + l.leetcode + '" target="_blank" rel="noopener">LeetCode</a></li>' +
        "</ul>";
    },

    about: function () {
      var p = DATA.profile;
      return '<h1 id="content-heading">About</h1>' +
        '<p class="lede">' + U.esc(p.about[0]) + "</p>" +
        '<dl class="meta-grid">' +
          "<div><dt>Name</dt><dd>" + U.esc(p.name) + "</dd></div>" +
          "<div><dt>Role</dt><dd>" + U.esc(p.role) + "</dd></div>" +
          "<div><dt>Location</dt><dd>" + U.esc(p.location) + "</dd></div>" +
        "</dl>" +
        '<div class="block"><span class="tag">Focus</span>' + Content.list(p.focus, "accent") + "</div>" +
        '<div class="block"><span class="tag">Background</span>' +
          "<p>" + U.esc(p.about[1]) + "</p><p>" + U.esc(p.about[2]) + "</p></div>" +
        '<div class="block"><span class="tag">Education</span>' +
          DATA.education.map(function (e) {
            return '<div class="card"><h3>' + U.esc(e.degree) +
              ' <span class="when">' + U.esc(e.period) + "</span></h3>" +
              "<p>" + U.esc(e.school) + "</p>" +
              '<p class="mono" style="margin:0;font-size:13px">' +
                U.esc(e.resultLabel) + " · " + U.esc(e.result) + "</p></div>";
          }).join("") + "</div>" +
        '<div class="block"><span class="tag">Elsewhere</span>' + Content.links() + "</div>";
    },

    experience: function () {
      var e = DATA.experience;
      return '<h1 id="content-heading">Experience</h1>' +
        '<p class="lede">' + U.esc(e.intro) + "</p>" +
        '<div class="block"><span class="tag">Professional experience</span>' +
          '<div class="card"><h3>' + U.esc(e.company) +
          ' <span class="role">' + U.esc(e.role) + "</span></h3>" +
          "<p>Worked across two company products as part of the QA function.</p></div>" +
          e.products.map(function (pr, i) {
            return '<div class="card"><h3>Product ' + (i + 1) + " — " + U.esc(pr.name) +
              ' <span class="when">' + U.esc(pr.kind) + "</span></h3>" +
              "<p>" + U.esc(pr.summary) + "</p>" +
              (pr.flow ? '<span class="tag">Product workflow</span><ul class="flow">' +
                pr.flow.map(function (f) { return "<li>" + U.esc(f) + "</li>"; }).join("") + "</ul>" : "") +
              '<span class="tag" style="display:block;margin-top:16px">Testing involvement</span>' +
              Content.list(pr.areas) + "</div>";
          }).join("") +
          '<p class="note">' + U.esc(e.confidentialityNote) + "</p>" +
        "</div>" +
        '<div class="block"><span class="tag">Certifications</span>' +
          DATA.certifications.map(function (c) {
            return '<div class="card"><h3>' + U.esc(c.title) + "</h3>" +
              '<p class="mono" style="font-size:13px;margin:6px 0 0">' + U.esc(c.issuer) +
              (c.when ? " · " + U.esc(c.when) : "") + "</p></div>";
          }).join("") + "</div>";
    },

    skills: function () {
      return '<h1 id="content-heading">Skills</h1>' +
        '<p class="lede">Testing practice first, automation to make it repeatable.</p>' +
        '<div class="cols">' + DATA.skills.map(function (g) {
          return "<section><h3>" + U.esc(g.group) + "</h3><ul>" +
            g.items.map(function (i) { return "<li>" + U.esc(i) + "</li>"; }).join("") +
            "</ul></section>";
        }).join("") + "</div>";
    },

    projects: function () {
      var lc = DATA.leetcode;
      var max = Math.max.apply(null, lc.breakdown.map(function (b) { return b.value; }));
      return '<h1 id="content-heading">Projects</h1>' +
        '<p class="lede">Personal projects, kept separate from the professional work under Experience.</p>' +
        DATA.projects.map(function (p) {
          return '<div class="card" style="margin-top:22px"><h3>' +
            '<span class="mono" style="color:var(--orange)">' + U.esc(p.id) + "</span> " +
            U.esc(p.name) + ' <span class="when">' + U.esc(p.type) + "</span></h3>" +
            "<p>" + U.esc(p.description) + "</p>" +
            Content.list(p.tech, "accent") +
            '<span class="tag" style="display:block;margin-top:14px">Includes</span>' +
            Content.list(p.features) +
            (p.stat ? '<div class="stat"><b>' + U.esc(p.stat.value) + "</b><span>" +
              U.esc(p.stat.label) + "</span></div>" : "") +
            (p.note ? '<p class="note">' + U.esc(p.note) + "</p>" : "") + "</div>";
        }).join("") +
        '<div class="block"><span class="tag">Coding and problem solving</span>' +
          '<div class="stat"><b>' + U.esc(lc.headline.split(" ")[0]) + "</b><span>problems solved on LeetCode</span></div>" +
          (lc.showBreakdown ? '<div class="bars">' + lc.breakdown.map(function (b) {
            return '<div class="b"><span>' + U.esc(b.label) + '</span>' +
              '<span class="track2"><i style="width:' + Math.round(b.value / max * 100) + '%"></i></span>' +
              "<span>" + b.value + "</span></div>";
          }).join("") + "</div>" : "") +
          '<p class="note">' + U.esc(lc.breakdownNote) + "</p>" +
          '<ul class="linklist"><li><a href="' + lc.url + '" target="_blank" rel="noopener">LeetCode · ' +
          U.esc(lc.username) + "</a></li>" +
          '<li><a href="' + DATA.links.github + '" target="_blank" rel="noopener">GitHub · all repositories</a></li></ul>' +
        "</div>";
    },

    qalab: function () {
      var b = DATA.bugDemo;
      return '<h1 id="content-heading">QA Lab</h1>' +
        '<p class="lede">The path a single requirement takes before anyone calls it done. ' +
        "Pick a stage to see what it produces.</p>" +
        '<span class="badge">Demo testing data</span>' +
        '<div role="tablist" aria-label="Testing workflow stages" class="stages" id="stage-tabs"></div>' +
        '<div class="stage-out" id="stage-out" role="tabpanel" tabindex="0"></div>' +

        '<div class="block"><span class="tag">Sample defect report</span>' +
        '<span class="badge">Demonstration bug — not production data</span>' +
        '<div class="bug"><div class="head"><span class="id">' + U.esc(b.id) + "</span>" +
        '<span class="ttl">' + U.esc(b.title) + "</span></div>" +
        '<dl class="grid"><div><dt>Severity</dt><dd>' + U.esc(b.severity) + "</dd></div>" +
        "<div><dt>Priority</dt><dd>" + U.esc(b.priority) + "</dd></div>" +
        "<div><dt>Environment</dt><dd>" + U.esc(b.environment) + "</dd></div></dl>" +
        '<div class="body"><h4>Steps to reproduce</h4><ol>' +
        b.steps.map(function (s) { return "<li>" + U.esc(s) + "</li>"; }).join("") + "</ol>" +
        '<h4>Expected result</h4><p class="res">' + U.esc(b.expected) + "</p>" +
        '<h4>Actual result</h4><p class="res">' + U.esc(b.actual) + "</p></div></div></div>" +

        '<div class="block"><span class="tag">Automation run</span>' +
        '<span class="badge">Demonstration</span>' +
        '<div class="term"><div class="tbar"><span class="dot"></span><span class="dot"></span>' +
        '<span class="dot"></span><span class="tname">playwright — demo run</span></div>' +
        '<pre id="term-out" aria-label="Sample Playwright test output"></pre></div></div>';
    },

    contact: function () {
      var c = DATA.contact, p = DATA.profile;
      var resumeHtml = "";
      var emailHtml = "";

      if (c.resume || c.resumeUrl) {
        var rUrl = c.resume || c.resumeUrl;
        var rName = c.resumeFilename || "Ubais_Ahamed_Resume.pdf";
        resumeHtml = '<li><a class="btn-accent" href="' + U.esc(rUrl) + '" target="_blank" rel="noopener">' +
          '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:text-bottom;margin-right:5px"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>' +
          'View Résumé (PDF)</a></li>' +
          '<li><a href="' + U.esc(rUrl) + '" download="' + U.esc(rName) + '">' +
          '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:text-bottom;margin-right:5px"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>' +
          'Download Résumé</a></li>';
      } else if (c.resumePlaceholder) {
        resumeHtml = '<li><span class="ghost" role="note">' + U.esc(c.resumePlaceholder) + ' <small>placeholder</small></span></li>';
      }

      if (c.email) {
        emailHtml = '<li><a href="mailto:' + U.esc(c.email) + '">' +
          '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:text-bottom;margin-right:5px"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>' +
          'Email · ' + U.esc(c.email) + '</a></li>';
      } else if (c.emailPlaceholder) {
        emailHtml = '<li><span class="ghost" role="note">' + U.esc(c.emailPlaceholder) + ' <small>placeholder</small></span></li>';
      }

      var directBlock = "";
      if (c.resume || c.email) {
        directBlock = '<div class="block"><span class="tag">Direct contact & documents</span>' +
          '<ul class="linklist">' + resumeHtml + emailHtml + '</ul>' +
          '<p style="margin-top:14px">My résumé is available above for instant viewing and offline download. For inquiries, interviews, or collaboration, feel free to send an email or connect on LinkedIn.</p></div>';
      } else {
        directBlock = '<div class="block"><span class="tag">Not published yet</span>' +
          '<ul class="linklist">' + emailHtml + resumeHtml + '</ul>' +
          '<p>These two buttons are intentionally inactive — no address or file has been published for them.</p></div>';
      }

      return '<h1 id="content-heading">' + U.esc(c.heading) + "</h1>" +
        '<p class="lede">' + U.esc(c.blurb) + "</p>" +
        '<dl class="meta-grid"><div><dt>Name</dt><dd>' + U.esc(p.name) + "</dd></div>" +
        "<div><dt>Role</dt><dd>" + U.esc(p.shortRole) + "</dd></div>" +
        "<div><dt>Location</dt><dd>" + U.esc(p.location) + "</dd></div></dl>" +
        '<div class="block"><span class="tag">Profiles</span>' + Content.links() + "</div>" +
        directBlock;
    },

    render: function (id) { return Content[id] ? Content[id]() : ""; }
  };

  /* ======================================================================
     5. UI — DOM wiring
     ====================================================================== */
  var UI = {
    els: {},
    termTimer: null,
    lastTrigger: null,

    init: function (onSelect, onLeave) {
      var e = UI.els;
      e.hud = document.getElementById("hud");
      e.dockList = document.getElementById("dock-list");
      e.content = document.getElementById("content");
      e.panelBody = document.getElementById("panel-body");
      e.leave = document.getElementById("leave-btn");
      e.crumb = document.getElementById("crumb-id");
      e.state = document.getElementById("rd-state");
      e.target = document.getElementById("rd-target");
      e.grip = document.getElementById("rd-grip");
      e.bar = document.getElementById("rd-bar");
      e.hint = document.getElementById("hint");

      if (REDUCED) document.body.classList.add("reduced");

      DATA.sections.forEach(function (s) {
        var li = document.createElement("li");
        var b = document.createElement("button");
        b.type = "button";
        b.dataset.section = s.id;
        b.innerHTML = '<span class="n">' + s.num + '</span><span class="t">' +
          s.label.charAt(0) + s.label.slice(1).toLowerCase() + "</span>";
        b.setAttribute("aria-label", "Open section " + s.num + ", " + s.label);
        b.addEventListener("click", function () { UI.lastTrigger = b; onSelect(s.id, "ui"); });
        b.addEventListener("mouseenter", function () { UI.onNavHover(s.id); });
        b.addEventListener("mouseleave", function () { UI.onNavHover(null); });
        b.addEventListener("focus", function () { UI.onNavHover(s.id); });
        b.addEventListener("blur", function () { UI.onNavHover(null); });
        li.appendChild(b);
        e.dockList.appendChild(li);
      });

      e.leave.addEventListener("click", onLeave);
      document.addEventListener("keydown", function (ev) {
        if (ev.key === "Escape" && LabState.currentMode === "CONTENT") onLeave();
      });

      LabState.onChange(UI.sync);
      UI.sync(LabState);
    },

    onNavHover: function () {},   // replaced by Lab

    sync: function (st) {
      var e = UI.els;
      if (!e.state) return;
      e.state.textContent = st.currentMode.toLowerCase();
      e.target.textContent = st.selectedParcel
        ? st.selectedParcel.section.num + " " + st.selectedParcel.section.label
        : (st.hovered ? st.hovered.section.num + " " + st.hovered.section.label : "—");
      e.target.className = "v" + ((st.hovered || st.selectedParcel) ? " lock" : "");
      e.grip.textContent = st.isGrabbing ? "closed" : "open";
      e.hud.classList.toggle("busy", st.busy());

      var btns = e.dockList.querySelectorAll("button");
      for (var i = 0; i < btns.length; i++) {
        btns[i].disabled = st.currentMode !== "IDLE";
        btns[i].setAttribute("aria-current", btns[i].dataset.section === st.activeSection ? "true" : "false");
      }
      if (st.hovered && st.currentMode === "IDLE") {
        e.hint.textContent = "Target locked · " + st.hovered.section.num + " " + st.hovered.section.label;
      } else if (st.currentMode === "IDLE") {
        e.hint.textContent = IS_TOUCH
          ? "Drag to drive the arm · tap a parcel to open a section"
          : "Move the pointer to drive the arm · click a parcel to open a section";
      } else if (st.currentMode === "CONTENT") {
        e.hint.textContent = "Press Leave or Escape to put the parcel back";
      } else {
        e.hint.textContent = "Robot working · " + st.currentMode.toLowerCase();
      }
    },

    progress: function (p) {
      if (UI.els.bar) UI.els.bar.style.width = Math.round(U.clamp(p, 0, 1) * 100) + "%";
    },

    openPanel: function (sectionId) {
      var s = DATA.sections.filter(function (x) { return x.id === sectionId; })[0];
      UI.els.panelBody.innerHTML = Content.render(sectionId);
      UI.els.crumb.textContent = s.num;
      UI.els.content.classList.add("open");
      UI.els.content.scrollTop = 0;
      if (sectionId === "qalab") UI.initQALab(UI.els.panelBody);
      var head = UI.els.panelBody.querySelector("#content-heading");
      if (head) head.setAttribute("tabindex", "-1");
      window.setTimeout(function () {
        (head || UI.els.leave).focus();
      }, REDUCED ? 0 : 260);
    },

    closePanel: function () {
      UI.els.content.classList.remove("open");
      if (UI.termTimer) { window.clearTimeout(UI.termTimer); UI.termTimer = null; }
      if (UI.lastTrigger) { UI.lastTrigger.focus(); UI.lastTrigger = null; }
    },

    /* ---- QA Lab interactive workflow -------------------------------- */
    initQALab: function (root) {
      var tabs = root.querySelector("#stage-tabs");
      var out = root.querySelector("#stage-out");
      if (!tabs) return;

      DATA.qaWorkflow.forEach(function (stage, i) {
        var b = document.createElement("button");
        b.type = "button";
        b.setAttribute("role", "tab");
        b.id = "tab-" + stage.key;
        b.setAttribute("aria-selected", i === 0 ? "true" : "false");
        b.tabIndex = i === 0 ? 0 : -1;
        b.innerHTML = '<span class="i">' + String(i + 1).padStart(2, "0") + "</span>" + U.esc(stage.name);
        b.addEventListener("click", function () { show(i); });
        b.addEventListener("keydown", function (ev) {
          var d = ev.key === "ArrowRight" ? 1 : (ev.key === "ArrowLeft" ? -1 : 0);
          if (!d) return;
          ev.preventDefault();
          show((i + d + DATA.qaWorkflow.length) % DATA.qaWorkflow.length, true);
        });
        tabs.appendChild(b);
      });

      function show(i, focus) {
        var stage = DATA.qaWorkflow[i];
        var all = tabs.querySelectorAll("button");
        for (var k = 0; k < all.length; k++) {
          all[k].setAttribute("aria-selected", k === i ? "true" : "false");
          all[k].tabIndex = k === i ? 0 : -1;
        }
        if (focus) all[i].focus();
        out.setAttribute("aria-labelledby", "tab-" + stage.key);
        out.innerHTML = '<span class="tag">Stage ' + String(i + 1).padStart(2, "0") +
          " of " + DATA.qaWorkflow.length + "</span><h3>" + U.esc(stage.name) + "</h3>" +
          "<p>" + U.esc(stage.blurb) + '</p><div class="demo">' + U.esc(stage.demo) + "</div>";
      }
      show(0);
      UI.runTerminal(root.querySelector("#term-out"));
    },

    runTerminal: function (pre) {
      if (!pre) return;
      var lines = DATA.terminal, i = 0;
      pre.textContent = "";
      function paint(n) {
        pre.innerHTML = lines.slice(0, n).map(function (l) {
          return l.c ? '<span class="' + l.c + '">' + U.esc(l.t) + "</span>" : U.esc(l.t);
        }).join("\n");
      }
      if (REDUCED) { paint(lines.length); return; }
      (function step() {
        i++;
        paint(i);
        if (i < lines.length) UI.termTimer = window.setTimeout(step, 160);
      })();
    }
  };

  /* ======================================================================
     6. TEXTURES — procedural cardboard labels
     ====================================================================== */
  function noise(ctx, w, h, amount) {
    for (var i = 0; i < amount; i++) {
      var x = Math.random() * w, y = Math.random() * h;
      ctx.fillStyle = "rgba(" + (Math.random() > 0.5 ? "255,255,255," : "90,60,30,") +
        (0.02 + Math.random() * 0.05) + ")";
      ctx.fillRect(x, y, 2 + Math.random() * 7, 1 + Math.random() * 3);
    }
  }
  function barcode(ctx, x, y, w, h) {
    ctx.fillStyle = "#2a2c30";
    var cx = x;
    while (cx < x + w) {
      var bw = 2 + Math.floor(Math.random() * 6);
      ctx.fillRect(cx, y, bw, h);
      cx += bw + 2 + Math.floor(Math.random() * 6);
    }
  }
  function baseCard(ctx, w, h) {
    ctx.fillStyle = "#c79a64";
    ctx.fillRect(0, 0, w, h);
    var g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, "rgba(255,255,255,.16)");
    g.addColorStop(0.55, "rgba(255,255,255,0)");
    g.addColorStop(1, "rgba(80,50,20,.16)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    noise(ctx, w, h, Math.floor(w * h / 900));
  }

  function makeTopTexture(section) {
    var c = document.createElement("canvas");
    c.width = c.height = 512;
    var x = c.getContext("2d");
    baseCard(x, 512, 512);

    x.strokeStyle = "rgba(42,44,48,.55)";
    x.lineWidth = 4;
    x.strokeRect(34, 34, 444, 444);

    x.fillStyle = "#2a2c30";
    x.textAlign = "left";
    x.font = "600 152px 'IBM Plex Mono', monospace";
    x.fillText(section.num, 62, 212);

    x.fillStyle = "#e8590c";
    x.fillRect(62, 236, 388, 7);

    x.fillStyle = "#26282c";
    var size = section.label.length > 9 ? 56 : 70;
    x.font = "700 " + size + "px Inter, sans-serif";
    x.fillText(section.label, 62, 312);

    x.fillStyle = "rgba(42,44,48,.62)";
    x.font = "500 21px 'IBM Plex Mono', monospace";
    x.fillText("QA LAB · STAGING", 62, 366);
    x.fillText("HANDLE WITH CARE", 62, 394);
    barcode(x, 62, 414, 300, 44);
    x.fillStyle = "rgba(42,44,48,.5)";
    x.font = "500 18px 'IBM Plex Mono', monospace";
    x.fillText("UA-" + section.num, 378, 452);

    var t = new THREE.CanvasTexture(c);
    t.anisotropy = 4;
    t.encoding = THREE.sRGBEncoding;
    return t;
  }

  function makeSideTexture(section) {
    var c = document.createElement("canvas");
    c.width = 512; c.height = 256;
    var x = c.getContext("2d");
    baseCard(x, 512, 256);

    x.fillStyle = "rgba(42,44,48,.28)";
    x.fillRect(0, 122, 512, 3);          // centre seam

    x.fillStyle = "#2a2c30";
    x.textAlign = "left";
    x.font = "600 64px 'IBM Plex Mono', monospace";
    x.fillText(section.num, 34, 88);
    x.fillStyle = "#26282c";
    x.font = "700 " + (section.label.length > 9 ? 36 : 44) + "px Inter, sans-serif";
    x.fillText(section.label, 122, 86);
    x.fillStyle = "#e8590c";
    x.fillRect(34, 104, 200, 5);
    x.fillStyle = "rgba(42,44,48,.55)";
    x.font = "500 18px 'IBM Plex Mono', monospace";
    x.fillText("PORTFOLIO MODULE · UA-" + section.num, 34, 172);
    barcode(x, 34, 190, 190, 32);

    var t = new THREE.CanvasTexture(c);
    t.anisotropy = 4;
    t.encoding = THREE.sRGBEncoding;
    return t;
  }

  /* Rounded/bevelled box, used for robot links. */
  function beveledBox(w, h, d, r) {
    var s = new THREE.Shape();
    var hw = w / 2 - r, hh = h / 2 - r;
    s.moveTo(-hw - r, -hh);
    s.lineTo(-hw - r, hh);
    s.absarc(-hw, hh, r, Math.PI, Math.PI / 2, true);
    s.lineTo(hw, hh + r);
    s.absarc(hw, hh, r, Math.PI / 2, 0, true);
    s.lineTo(hw + r, -hh);
    s.absarc(hw, -hh, r, 0, -Math.PI / 2, true);
    s.lineTo(-hw, -hh - r);
    s.absarc(-hw, -hh, r, -Math.PI / 2, -Math.PI, true);
    var g = new THREE.ExtrudeGeometry(s, {
      depth: d - 0.02, bevelEnabled: true, bevelSize: 0.008,
      bevelThickness: 0.008, bevelSegments: 2, curveSegments: 4
    });
    g.translate(0, 0, -(d - 0.02) / 2);
    g.computeVertexNormals();
    return g;
  }

  /* ======================================================================
     7. ROBOT MODEL — pure visuals. Swap this class for a GLTF loader and
        nothing else in the app has to change, as long as it exposes
        .root, .joints{j1..j6}, .gripper, .anchor and setGrip().
     ====================================================================== */
  function RobotModel() {
    var C = CFG.color;
    var matMetal = new THREE.MeshStandardMaterial({ color: C.metal, metalness: 0.65, roughness: 0.42 });
    var matDark = new THREE.MeshStandardMaterial({ color: C.metalDark, metalness: 0.7, roughness: 0.35 });
    var matCoal = new THREE.MeshStandardMaterial({ color: C.charcoal, metalness: 0.45, roughness: 0.55 });
    var matOrange = new THREE.MeshStandardMaterial({ color: C.orange, metalness: 0.2, roughness: 0.5 });
    this.materials = [matMetal, matDark, matCoal, matOrange];

    function mesh(geo, mat) {
      var m = new THREE.Mesh(geo, mat);
      m.castShadow = true; m.receiveShadow = true;
      return m;
    }

    this.root = new THREE.Group();
    this.root.name = "Robot";

    /* --- fixed base ------------------------------------------------ */
    var plinth = mesh(new THREE.CylinderGeometry(0.46, 0.52, 0.13, 32), matCoal);
    plinth.position.y = 0.065;
    this.root.add(plinth);
    var ring = mesh(new THREE.TorusGeometry(0.44, 0.022, 8, 40), matOrange);
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.135;
    this.root.add(ring);

    /* --- J1 : waist yaw -------------------------------------------- */
    var j1 = new THREE.Group(); j1.position.y = 0.13; this.root.add(j1);
    var waist = mesh(new THREE.CylinderGeometry(0.33, 0.39, 0.30, 28), matMetal);
    waist.position.y = 0.15; j1.add(waist);
    var column = mesh(beveledBox(0.42, 0.56, 0.40, 0.06), matCoal);
    column.position.y = 0.54; j1.add(column);
    var stripe = mesh(new THREE.BoxGeometry(0.44, 0.04, 0.20), matOrange);
    stripe.position.set(0, 0.36, 0); j1.add(stripe);

    /* --- J2 : shoulder pitch --------------------------------------- */
    var j2 = new THREE.Group();
    j2.position.y = CFG.robot.shoulderY - 0.13;   // local to j1
    j1.add(j2);
    var shoulderHub = mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.48, 24), matDark);
    shoulderHub.rotation.z = Math.PI / 2; j2.add(shoulderHub);
    var upper = mesh(beveledBox(0.26, CFG.robot.l1 - 0.12, 0.30, 0.05), matMetal);
    upper.position.y = CFG.robot.l1 / 2; j2.add(upper);
    var upperTrim = mesh(new THREE.BoxGeometry(0.28, 0.05, 0.10), matOrange);
    upperTrim.position.y = CFG.robot.l1 * 0.72; j2.add(upperTrim);

    /* --- J3 : elbow pitch ------------------------------------------ */
    var j3 = new THREE.Group(); j3.position.y = CFG.robot.l1; j2.add(j3);
    var elbowHub = mesh(new THREE.CylinderGeometry(0.155, 0.155, 0.38, 22), matDark);
    elbowHub.rotation.z = Math.PI / 2; j3.add(elbowHub);
    var fore = mesh(beveledBox(0.21, CFG.robot.l2 - 0.14, 0.24, 0.045), matMetal);
    fore.position.y = CFG.robot.l2 / 2; j3.add(fore);
    var foreTrim = mesh(new THREE.BoxGeometry(0.23, 0.04, 0.09), matOrange);
    foreTrim.position.y = CFG.robot.l2 * 0.34; j3.add(foreTrim);

    /* --- J4 : wrist roll ------------------------------------------- */
    var j4 = new THREE.Group(); j4.position.y = CFG.robot.l2; j3.add(j4);
    var wristA = mesh(new THREE.CylinderGeometry(0.115, 0.115, 0.17, 20), matDark);
    j4.add(wristA);

    /* --- J5 : wrist pitch ------------------------------------------ */
    var j5 = new THREE.Group(); j5.position.y = 0.0; j4.add(j5);
    var wristB = mesh(new THREE.CylinderGeometry(0.10, 0.10, 0.26, 20), matMetal);
    wristB.rotation.z = Math.PI / 2; wristB.position.y = 0.02; j5.add(wristB);

    /* --- J6 : tool roll -------------------------------------------- */
    var j6 = new THREE.Group(); j6.position.y = 0.10; j5.add(j6);
    var flange = mesh(new THREE.CylinderGeometry(0.095, 0.085, 0.06, 20), matDark);
    flange.position.y = 0.02; j6.add(flange);

    /* --- gripper ---------------------------------------------------- */
    var gripper = new THREE.Group(); gripper.name = "Gripper"; j6.add(gripper);
    var palm = mesh(beveledBox(0.66, 0.10, 0.20, 0.025), matCoal);
    palm.position.y = 0.10; gripper.add(palm);
    var palmTrim = mesh(new THREE.BoxGeometry(0.67, 0.018, 0.06), matOrange);
    palmTrim.position.y = 0.152; gripper.add(palmTrim);

    function finger(sign) {
      var g = new THREE.Group();
      var arm = mesh(beveledBox(0.06, 0.26, 0.15, 0.015), matMetal);
      arm.position.y = 0.21; g.add(arm);
      var pad = mesh(new THREE.BoxGeometry(0.035, 0.20, 0.17), matCoal);
      pad.position.set(-sign * 0.022, 0.32, 0); g.add(pad);
      g.position.x = sign * CFG.gripper.open;
      return g;
    }
    var fL = finger(-1), fR = finger(1);
    gripper.add(fL); gripper.add(fR);

    /* --- parcel anchor ---------------------------------------------- */
    var anchor = new THREE.Group();
    anchor.name = "ParcelAnchor";
    anchor.position.y = CFG.robot.toolOffset - 0.10; // measured from j6 origin
    j6.add(anchor);

    this.joints = { j1: j1, j2: j2, j3: j3, j4: j4, j5: j5, j6: j6 };
    this.gripper = gripper;
    this.fingers = [fL, fR];
    this.anchor = anchor;
    this.gripValue = CFG.gripper.open;
  }

  RobotModel.prototype.setGrip = function (v) {
    this.gripValue = v;
    this.fingers[0].position.x = -v;
    this.fingers[1].position.x = v;
  };
  RobotModel.prototype.applyJoints = function (a) {
    this.joints.j1.rotation.y = a.j1;
    this.joints.j2.rotation.x = a.j2;
    this.joints.j3.rotation.x = a.j3;
    this.joints.j4.rotation.y = a.j4;
    this.joints.j5.rotation.x = a.j5;
    this.joints.j6.rotation.y = a.j6;
  };

  /* ======================================================================
     8. ROBOT CONTROLLER — IK + damping. Knows nothing about the DOM,
        the portfolio, or which parcel is selected.
     ====================================================================== */
  function RobotController(model) {
    this.model = model;
    /* rest pose matches the IK solution for the neutral target, so the arm
       does not swing wildly on the first frame */
    this.current = { j1: 0.78, j2: 0.55, j3: 1.45, j4: 0, j5: 1.14, j6: 0 };
    this.goal = { j1: 0.78, j2: 0.55, j3: 1.45, j4: 0, j5: 1.14, j6: 0 };
    this.target = new THREE.Vector3(1.1, 1.1, 1.1);
    this.rollGoal = 0;
    this.grip = CFG.gripper.open;
    this.gripGoal = CFG.gripper.open;
    this.lambda = CFG.robot.damp.idle;
    this._v = new THREE.Vector3();
  }

  /* Analytic 2-link IK in the plane selected by the base yaw.
     Solves for the *anchor* position; the tool is held pointing down. */
  RobotController.prototype.solve = function (p) {
    var R = CFG.robot, b = R.base;
    var wy = p.y + R.toolOffset;                 // wrist centre sits above the anchor
    var dx = p.x - b.x, dz = p.z - b.z;
    var yaw = Math.atan2(dx, dz);
    var f = Math.sqrt(dx * dx + dz * dz);
    var h = wy - (b.y + R.shoulderY);
    var psi = Math.atan2(f, h);                  // angle of the target from +Y
    var d = Math.sqrt(f * f + h * h);
    var dMax = (R.l1 + R.l2) * 0.995;
    var dMin = Math.abs(R.l1 - R.l2) + 0.06;
    d = U.clamp(d, dMin, dMax);

    var c = U.clamp((d * d - R.l1 * R.l1 - R.l2 * R.l2) / (2 * R.l1 * R.l2), -1, 1);
    var th2 = R.elbowSign * Math.acos(c);
    var th1 = psi - Math.atan2(R.l2 * Math.sin(th2), R.l1 + R.l2 * Math.cos(th2));

    var L = R.limits;
    return {
      j1: U.clamp(yaw, L.j1[0], L.j1[1]),
      j2: U.clamp(th1, L.j2[0], L.j2[1]),
      j3: U.clamp(th2, L.j3[0], L.j3[1]),
      j4: 0,
      j5: U.clamp(Math.PI - (th1 + th2), L.j5[0], L.j5[1]),
      j6: U.clamp(this.rollGoal - yaw, L.j6[0], L.j6[1])
    };
  };

  RobotController.prototype.setTarget = function (v) { this.target.copy(v); };
  RobotController.prototype.setRoll = function (r) { this.rollGoal = r; };
  RobotController.prototype.setGrip = function (v) { this.gripGoal = v; };
  RobotController.prototype.setMode = function (sequence) {
    this.lambda = sequence ? CFG.robot.damp.sequence : CFG.robot.damp.idle;
  };

  RobotController.prototype.update = function (dt, idleTime) {
    this.goal = this.solve(this.target);
    if (idleTime !== null && !REDUCED) {
      /* a little life in the wrist roll while waiting */
      this.goal.j4 = Math.sin(idleTime * 0.7) * 0.07;
    }
    var maxStep = CFG.robot.maxJointSpeed * dt;
    for (var k in this.current) {
      if (!this.current.hasOwnProperty(k)) continue;
      var next = U.damp(this.current[k], this.goal[k], this.lambda, dt);
      var delta = U.clamp(next - this.current[k], -maxStep, maxStep);
      this.current[k] += delta;
    }
    this.model.applyJoints(this.current);
    this.grip = U.damp(this.grip, this.gripGoal, 9, dt);
    this.model.setGrip(this.grip);
  };

  RobotController.prototype.anchorWorld = function (out) {
    this.model.anchor.updateWorldMatrix(true, false);
    return out.setFromMatrixPosition(this.model.anchor.matrixWorld);
  };

  /* ======================================================================
     9. PARCELS
     ====================================================================== */
  function Parcel(section, position, yaw) {
    var P = CFG.staging.parcel;
    this.section = section;
    this.homePosition = position.clone();
    this.homeYaw = yaw;

    var top = makeTopTexture(section);
    var side = makeSideTexture(section);
    var sideMat = function () {
      return new THREE.MeshStandardMaterial({ map: side, roughness: 0.93, metalness: 0.0 });
    };
    var bottomMat = new THREE.MeshStandardMaterial({ color: 0xb08a5c, roughness: 0.95 });
    this.faceMats = [sideMat(), sideMat(), // +x, -x
      new THREE.MeshStandardMaterial({ map: top, roughness: 0.9, metalness: 0.0 }), // +y
      bottomMat,
      sideMat(), sideMat()]; // +z, -z

    var group = new THREE.Group();
    group.name = "Parcel_" + section.num;

    var body = new THREE.Mesh(new THREE.BoxGeometry(P.w, P.h, P.d), this.faceMats);
    body.castShadow = true; body.receiveShadow = true;
    body.userData.parcel = this;
    group.add(body);

    /* packing tape + seams, real geometry rather than a texture trick */
    var tapeMat = new THREE.MeshStandardMaterial({
      color: 0xdccfb6, roughness: 0.38, metalness: 0.02, transparent: true, opacity: 0.88
    });
    var t1 = new THREE.Mesh(new THREE.BoxGeometry(P.w + 0.004, 0.006, 0.10), tapeMat);
    t1.position.set(0, P.h / 2 + 0.002, P.d * 0.33);
    t1.receiveShadow = true;
    group.add(t1);
    [-1, 1].forEach(function (s) {
      var t = new THREE.Mesh(new THREE.BoxGeometry(0.075, P.h + 0.004, 0.006), tapeMat);
      t.position.set(s * P.w * 0.32, 0, P.d / 2 + 0.002);
      group.add(t);
    });
    var edge = new THREE.Mesh(
      new THREE.BoxGeometry(P.w + 0.006, 0.012, P.d + 0.006),
      new THREE.MeshStandardMaterial({ color: 0xa8814f, roughness: 0.95 })
    );
    edge.position.y = -P.h / 2 + 0.006;
    group.add(edge);

    group.position.copy(position);
    group.rotation.y = yaw;

    this.group = group;
    this.body = body;
    this.hover = 0;
    this.hoverGoal = 0;
  }

  Parcel.prototype.setHover = function (on) { this.hoverGoal = on ? 1 : 0; };

  Parcel.prototype.update = function (dt, free) {
    var prev = this.hover;
    this.hover = U.damp(this.hover, this.hoverGoal, 10, dt);
    if (Math.abs(this.hover - prev) < 0.0005 && this.hover < 0.001) return;
    if (free) {
      this.group.position.y = this.homePosition.y + this.hover * 0.055;
      var s = 1 + this.hover * 0.015;
      this.group.scale.setScalar(s);
    }
    for (var i = 0; i < this.faceMats.length; i++) {
      var m = this.faceMats[i];
      m.emissive.setHex(CFG.color.orange);
      m.emissiveIntensity = this.hover * 0.22;
    }
  };

  /* ======================================================================
     10. CAMERA RIG
     ====================================================================== */
  function CameraRig(camera) {
    var home = IS_SMALL ? CFG.camera.homeSmall : CFG.camera.home;
    this.camera = camera;
    this.homePos = new THREE.Vector3().fromArray(home.pos);
    this.homeLook = new THREE.Vector3().fromArray(home.look);
    this.goalPos = this.homePos.clone();
    this.goalLook = this.homeLook.clone();
    this.look = this.homeLook.clone();
    this.parallax = new THREE.Vector2();
    this.lambda = CFG.camera.damp;
    camera.position.copy(this.homePos);
    camera.lookAt(this.look);
    this._dir = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);
    this._goal = new THREE.Vector3();
  }

  CameraRig.prototype.home = function () {
    this.goalPos.copy(this.homePos);
    this.goalLook.copy(this.homeLook);
  };

  /* Frame a world point; shift laterally so the subject clears the panel. */
  CameraRig.prototype.frame = function (subject, distance, lift, lateral) {
    this._dir.copy(this.homePos).sub(this.homeLook).normalize();
    this.goalPos.copy(subject).addScaledVector(this._dir, distance);
    this.goalPos.y = subject.y + lift;
    this.goalLook.copy(subject);
    if (lateral) {
      this._right.copy(this.goalLook).sub(this.goalPos).cross(this._up).normalize();
      this.goalPos.addScaledVector(this._right, lateral);
      this.goalLook.addScaledVector(this._right, lateral);
    }
  };

  CameraRig.prototype.update = function (dt, pointer, allowParallax) {
    var lam = REDUCED ? 60 : this.lambda;
    this._goal.copy(this.goalPos);
    if (allowParallax && !REDUCED) {
      this.parallax.x = U.damp(this.parallax.x, pointer.x * 0.26, 1.6, dt);
      this.parallax.y = U.damp(this.parallax.y, pointer.y * 0.16, 1.6, dt);
      this._goal.x += this.parallax.x;
      this._goal.y += this.parallax.y;
    }
    U.dampV(this.camera.position, this._goal, lam, dt);
    U.dampV(this.look, this.goalLook, lam, dt);
    this.camera.lookAt(this.look);
  };

  /* ======================================================================
     11. LAB — scene assembly and the pickup / return state machine
     ====================================================================== */
  function Lab(canvas) {
    this.canvas = canvas;
    this.clock = new THREE.Clock();
    this.parcels = [];
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2(0, 0);
    this.pointerActive = false;
    this.idleTarget = new THREE.Vector3(1.05, 1.05, 1.05);
    this.tmp = new THREE.Vector3();
    this.tmp2 = new THREE.Vector3();
    this.phaseQueue = [];
    this.phase = null;
    this.phaseT = 0;
    this.pickPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.55);
    this.build();
  }

  Lab.prototype.build = function () {
    var self = this;
    var C = CFG.color;

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas, antialias: !IS_SMALL, powerPreference: "high-performance"
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, IS_SMALL ? 1.6 : 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.outputEncoding = THREE.sRGBEncoding;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(C.bg);
    this.scene.fog = new THREE.Fog(C.bg, 13, 30);

    this.camera = new THREE.PerspectiveCamera(
      CFG.camera.fov, window.innerWidth / window.innerHeight, 0.1, 120);
    this.rig = new CameraRig(this.camera);

    /* ---- lighting: bright, clean, industrial ---------------------- */
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xcfc9be, 0.78));
    var key = new THREE.DirectionalLight(0xfff6ec, 1.15);
    key.position.set(4.2, 7.4, 5.0);
    key.castShadow = true;
    var sm = IS_SMALL ? 1024 : 2048;
    key.shadow.mapSize.set(sm, sm);
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 22;
    key.shadow.camera.left = -7; key.shadow.camera.right = 7;
    key.shadow.camera.top = 7; key.shadow.camera.bottom = -7;
    key.shadow.bias = -0.0012;
    key.shadow.normalBias = 0.02;
    this.scene.add(key);
    var fill = new THREE.DirectionalLight(0xe9eef5, 0.4);
    fill.position.set(-5.5, 3.6, -2.4);
    this.scene.add(fill);
    var rim = new THREE.DirectionalLight(0xffffff, 0.28);
    rim.position.set(-1.5, 2.2, -6);
    this.scene.add(rim);

    /* ---- floor and safety marking --------------------------------- */
    var floor = new THREE.Mesh(
      new THREE.PlaneGeometry(50, 50),
      new THREE.MeshStandardMaterial({ color: C.floor, roughness: 0.95, metalness: 0.0 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    var zone = new THREE.Mesh(
      new THREE.RingGeometry(2.28, 2.40, 64, 1, -0.25, 2.1),
      new THREE.MeshBasicMaterial({ color: C.floorLine, transparent: true, opacity: 0.7 })
    );
    zone.rotation.x = -Math.PI / 2;
    zone.position.y = 0.004;
    this.scene.add(zone);

    var pad = new THREE.Mesh(
      new THREE.CircleGeometry(0.85, 40),
      new THREE.MeshStandardMaterial({ color: 0xcfcbc3, roughness: 0.9 })
    );
    pad.rotation.x = -Math.PI / 2;
    pad.position.y = 0.002;
    pad.receiveShadow = true;
    this.scene.add(pad);

    /* ---- background props (deliberately sparse) -------------------- */
    var crateMat = new THREE.MeshStandardMaterial({ color: 0xbd9464, roughness: 0.95 });
    var rackMat = new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.6, metalness: 0.4 });
    var crateGeo = new THREE.BoxGeometry(0.62, 0.46, 0.62);
    [[-2.9, 0.23, -1.5], [-2.9, 0.69, -1.5], [-2.3, 0.23, -2.0], [2.6, 0.23, -2.4]]
      .forEach(function (p) {
        var m = new THREE.Mesh(crateGeo, crateMat);
        m.position.set(p[0], p[1], p[2]);
        m.rotation.y = (Math.random() - 0.5) * 0.4;
        m.castShadow = true; m.receiveShadow = true;
        self.scene.add(m);
      });
    var rack = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.08, 0.5), rackMat);
    rack.position.set(-1.2, 1.55, -3.2); rack.castShadow = true;
    this.scene.add(rack);
    var rack2 = rack.clone(); rack2.position.y = 0.95; this.scene.add(rack2);
    [-3.7, 1.3].forEach(function (x) {
      var post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.0, 0.5), rackMat);
      post.position.set(x, 1.0, -3.2); post.castShadow = true;
      self.scene.add(post);
    });

    /* ---- robot ----------------------------------------------------- */
    this.robotModel = new RobotModel();
    this.robotModel.root.position.set(CFG.robot.base.x, CFG.robot.base.y, CFG.robot.base.z);
    this.scene.add(this.robotModel.root);
    this.robot = new RobotController(this.robotModel);

    /* ---- staging area: pedestals + parcels ------------------------- */
    this.staging = new THREE.Group();
    this.staging.name = "Staging";
    this.scene.add(this.staging);

    var S = CFG.staging;
    var pedGeo = new THREE.BoxGeometry(S.pedestal.w, S.pedestal.h, S.pedestal.d);
    var pedMat = new THREE.MeshStandardMaterial({ color: C.pedestal, roughness: 0.62, metalness: 0.25 });
    var pedTopMat = new THREE.MeshStandardMaterial({ color: 0x4a4e55, roughness: 0.7, metalness: 0.2 });

    DATA.sections.forEach(function (section) {
      var ang = S.angles[section.slot.col];
      var rad = S.radii[section.slot.row];
      var px = Math.sin(ang) * rad, pz = Math.cos(ang) * rad;

      var ped = new THREE.Mesh(pedGeo, pedMat);
      ped.position.set(px, S.pedestal.h / 2, pz);
      ped.rotation.y = ang;
      ped.castShadow = true; ped.receiveShadow = true;
      self.staging.add(ped);

      var cap = new THREE.Mesh(new THREE.BoxGeometry(S.pedestal.w + 0.02, 0.03, S.pedestal.d + 0.02), pedTopMat);
      cap.position.set(px, S.pedestal.h, pz);
      cap.rotation.y = ang;
      cap.receiveShadow = true;
      self.staging.add(cap);

      var mark = new THREE.Mesh(
        new THREE.BoxGeometry(S.pedestal.w * 0.7, 0.032, 0.035),
        new THREE.MeshStandardMaterial({ color: C.orange, roughness: 0.6 })
      );
      mark.position.set(px, S.pedestal.h + 0.002, pz);
      mark.rotation.y = ang;
      mark.translateZ(S.pedestal.d * 0.42);
      self.staging.add(mark);

      var pos = new THREE.Vector3(px, S.pedestal.h + S.parcel.h / 2 + 0.015, pz);
      var parcel = new Parcel(section, pos, ang);
      self.staging.add(parcel.group);
      self.parcels.push(parcel);

      /* target reticle under each parcel, revealed on hover */
      var ret = new THREE.Mesh(
        new THREE.RingGeometry(0.40, 0.445, 28),
        new THREE.MeshBasicMaterial({ color: C.orange, transparent: true, opacity: 0 })
      );
      ret.rotation.x = -Math.PI / 2;
      ret.position.set(px, S.pedestal.h + 0.026, pz);
      self.staging.add(ret);
      parcel.reticle = ret;
    });

    this.hitTargets = this.parcels.map(function (p) { return p.body; });
    this.robot.setTarget(this.idleTarget);
    this.bindEvents();
  };

  /* ---------------- input ------------------------------------------- */
  Lab.prototype.bindEvents = function () {
    var self = this, c = this.canvas;

    function toNDC(ev) {
      self.pointer.x = (ev.clientX / window.innerWidth) * 2 - 1;
      self.pointer.y = -((ev.clientY / window.innerHeight) * 2 - 1);
      self.pointerActive = true;
    }

    c.addEventListener("pointermove", function (ev) {
      toNDC(ev);
      if (LabState.currentMode === "IDLE") self.updatePointerTarget();
    }, { passive: true });

    c.addEventListener("pointerdown", function (ev) { toNDC(ev); }, { passive: true });

    c.addEventListener("pointerup", function (ev) {
      toNDC(ev);
      if (LabState.currentMode !== "IDLE") return;
      self.updatePointerTarget();
      var hit = self.pick();
      if (hit) { UI.lastTrigger = null; self.select(hit.section.id); }
    });

    c.addEventListener("pointerleave", function () {
      self.pointerActive = false;
      self.setHover(null);
    });

    window.addEventListener("resize", function () { self.resize(); }, { passive: true });
    window.addEventListener("orientationchange", function () { self.resize(); });
  };

  Lab.prototype.resize = function () {
    var w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  };

  Lab.prototype.pick = function () {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    var hits = this.raycaster.intersectObjects(this.hitTargets, false);
    return hits.length ? hits[0].object.userData.parcel : null;
  };

  Lab.prototype.setHover = function (parcel) {
    if (LabState.hovered === parcel) return;
    if (LabState.hovered) LabState.hovered.setHover(false);
    if (parcel) parcel.setHover(true);
    LabState.set({ hovered: parcel });
  };

  /* Pointer -> a point inside the robot's workspace (never a raw joint angle) */
  Lab.prototype.updatePointerTarget = function () {
    if (!LabState.pointerEnabled || !this.pointerActive) return;
    this.raycaster.setFromCamera(this.pointer, this.camera);

    var hit = this.raycaster.ray.intersectPlane(this.pickPlane, this.tmp);
    if (!hit) {
      hit = this.tmp.copy(this.raycaster.ray.origin)
        .addScaledVector(this.raycaster.ray.direction, 6);
    }
    var W = CFG.workspace, b = CFG.robot.base;
    var dx = hit.x - b.x, dz = hit.z - b.z;
    var r = Math.sqrt(dx * dx + dz * dz) || 0.001;
    var cr = U.clamp(r, W.rMin, W.rMax);
    var y = U.clamp(0.74 + this.pointer.y * 0.62, W.yMin, W.yMax);
    this.idleTarget.set(b.x + dx / r * cr, y, b.z + dz / r * cr);

    var p = this.pick();
    this.setHover(p);
    /* align the tool roll with whatever is under the pointer */
    this.robot.setRoll(p ? p.homeYaw : Math.atan2(dx, dz));
  };

  /* ---------------- world-preserving re-parenting -------------------- */
  function reparent(obj, newParent) {
    obj.updateWorldMatrix(true, false);
    var world = obj.matrixWorld.clone();
    newParent.updateWorldMatrix(true, false);
    var inv = new THREE.Matrix4().copy(newParent.matrixWorld).invert();
    world.premultiply(inv);
    newParent.add(obj);                       // removes from the old parent
    world.decompose(obj.position, obj.quaternion, obj.scale);
    obj.updateMatrixWorld(true);
  }

  /* ---------------- phase machine ------------------------------------ */
  Lab.prototype.runPhases = function (list) {
    this.phaseQueue = list.slice();
    this.nextPhase();
  };

  Lab.prototype.nextPhase = function () {
    if (this.phase && this.phase.exit) this.phase.exit(this);
    if (!this.phaseQueue.length) { this.phase = null; return; }
    this.phase = this.phaseQueue.shift();
    this.phaseT = 0;
    LabState.set({ currentMode: this.phase.mode });
    if (this.phase.enter) this.phase.enter(this);
  };

  Lab.prototype.updatePhase = function (dt) {
    if (!this.phase) return;
    var p = this.phase;
    this.phaseT += dt;
    var t = p.dur > 0 ? U.clamp(this.phaseT / p.dur, 0, 1) : 1;
    if (p.update) p.update(this, t);
    if (p.mode !== "CONTENT") UI.progress(t);
    if (t >= 1 && !p.hold) this.nextPhase();
  };

  /* Interpolate the IK target from A to B across the phase. */
  function moveTo(getB, ease) {
    var A = new THREE.Vector3(), B = new THREE.Vector3();
    return {
      enter: function (lab) { A.copy(lab.robot.target); getB(lab, B); },
      update: function (lab, t) {
        var e = (ease || U.easeInOut)(t);
        lab.tmp2.copy(A).lerp(B, e);
        lab.robot.setTarget(lab.tmp2);
      }
    };
  }

  Lab.prototype.parcelHome = function (out) {
    return out.copy(LabState.selectedParcel.homePosition);
  };

  Lab.prototype.select = function (sectionId) {
    if (LabState.busy() || LabState.currentMode === "CONTENT") return;
    var parcel = this.parcels.filter(function (p) { return p.section.id === sectionId; })[0];
    if (!parcel) return;

    /* lock the parcel and store the exact original transform */
    parcel.setHover(false);
    parcel.hover = 0;
    parcel.hoverGoal = 0;
    parcel.group.position.copy(parcel.homePosition);
    parcel.group.scale.set(1, 1, 1);
    parcel.group.rotation.set(0, parcel.homeYaw, 0);
    parcel.group.updateMatrixWorld(true);

    var original = {
      parent: parcel.group.parent,
      position: parcel.group.position.clone(),
      quaternion: parcel.group.quaternion.clone(),
      scale: parcel.group.scale.clone()
    };

    this.setHover(null);
    LabState.set({
      selectedParcel: parcel,
      originalParcelTransform: original,
      pointerEnabled: false,
      activeSection: sectionId
    });
    this.robot.setMode(true);
    this.robot.setRoll(parcel.homeYaw);

    var above = function (h) {
      return function (l, out) { l.parcelHome(out); out.y += h; };
    };

    var pickup = [
      { mode: "TARGETING", dur: DUR(0.5), __init: moveTo(above(0.62)),
        enter: function (l) { l.rig.frame(parcel.homePosition, 3.15, 1.35, 0); } },
      { mode: "APPROACHING", dur: DUR(0.85), __init: moveTo(above(0.30)),
        enter: function (l) { l.robot.setGrip(CFG.gripper.open); } },
      { mode: "GRIPPING", dur: DUR(0.65), __init: moveTo(above(0.0), U.easeOut),
        update: function (l, t) {
          if (t > 0.55 && !LabState.isGrabbing) {
            l.robot.setGrip(CFG.gripper.closed);
            LabState.set({ isGrabbing: true });
          }
        } },
      { mode: "ATTACHING", dur: DUR(0.3),
        enter: function (l) {
          reparent(parcel.group, l.robotModel.anchor);
          LabState.set({ isAttached: true });
        } },
      { mode: "LIFTING", dur: DUR(1.0), __init: moveTo(function (l, out) {
          l.parcelHome(out);
          out.y += 0.85;
          out.x *= 0.72; out.z *= 0.72;
        }),
        update: function (l) {
          l.robot.anchorWorld(l.tmp);
          l.rig.frame(l.tmp, 2.9, 0.95, 0);
        } },
      { mode: "TRANSITIONING", dur: DUR(0.75),
        enter: function (l) { UI.openPanel(sectionId); },
        update: function (l) {
          l.robot.anchorWorld(l.tmp);
          l.rig.frame(l.tmp, IS_SMALL ? 3.4 : 2.75, 0.55, IS_SMALL ? 0 : 1.25);
        } },
      { mode: "CONTENT", dur: 0, hold: true,
        enter: function (l) { l.robot.setMode(false); },
        update: function (l) {
          l.robot.anchorWorld(l.tmp);
          l.rig.frame(l.tmp, IS_SMALL ? 3.4 : 2.75, 0.55, IS_SMALL ? 0 : 1.25);
        } }
    ];

    /* wire the deferred moveTo handlers */
    pickup.forEach(function (ph) {
      if (!ph.__init) return;
      var mv = ph.__init, userEnter = ph.enter, userUpdate = ph.update;
      ph.enter = function (l) { mv.enter(l); if (userEnter) userEnter(l); };
      ph.update = function (l, t) { mv.update(l, t); if (userUpdate) userUpdate(l, t); };
    });

    this.runPhases(pickup);
  };

  Lab.prototype.leave = function () {
    if (LabState.currentMode !== "CONTENT") return;
    var parcel = LabState.selectedParcel;
    var original = LabState.originalParcelTransform;
    if (!parcel || !original) return;

    this.robot.setMode(true);

    var above = function (h) {
      return function (l, out) { l.parcelHome(out); out.y += h; };
    };

    var ret = [
      { mode: "RETURNING", dur: DUR(0.8),
        enter: function (l) { UI.closePanel(); },
        update: function (l) {
          l.robot.anchorWorld(l.tmp);
          l.rig.frame(l.tmp, 3.1, 1.15, 0);
        },
        __init: moveTo(above(0.95)) },
      { mode: "RETURNING", dur: DUR(0.9), __init: moveTo(above(0.34)),
        enter: function (l) { l.rig.home(); } },
      { mode: "RETURNING", dur: DUR(0.6), __init: moveTo(above(0.0), U.easeOut) },
      { mode: "RELEASING", dur: DUR(0.55),
        enter: function (l) {
          l.robot.setGrip(CFG.gripper.open);
          LabState.set({ isGrabbing: false });
        },
        exit: function (l) {
          /* detach and restore the exact original transform */
          reparent(parcel.group, original.parent);
          parcel.group.position.copy(original.position);
          parcel.group.quaternion.copy(original.quaternion);
          parcel.group.scale.copy(original.scale);
          parcel.group.updateMatrixWorld(true);
          parcel.hover = 0; parcel.hoverGoal = 0;
          LabState.set({ isAttached: false });
        } },
      { mode: "HOMING", dur: DUR(0.9),
        __init: moveTo(function (l, out) { out.set(1.05, 1.05, 1.05); }),
        exit: function (l) {
          l.robot.setMode(false);
          LabState.set({
            currentMode: "IDLE",
            selectedParcel: null,
            originalParcelTransform: null,
            activeSection: null,
            pointerEnabled: true
          });
          l.idleTarget.set(1.05, 1.05, 1.05);
          UI.progress(0);
        } }
    ];

    ret.forEach(function (ph) {
      if (!ph.__init) return;
      var mv = ph.__init, userEnter = ph.enter, userUpdate = ph.update;
      ph.enter = function (l) { mv.enter(l); if (userEnter) userEnter(l); };
      ph.update = function (l, t) { mv.update(l, t); if (userUpdate) userUpdate(l, t); };
    });

    this.runPhases(ret);
  };

  /* ---------------- main loop ---------------------------------------- */
  Lab.prototype.start = function () {
    var self = this;
    LabState.set({ currentMode: "IDLE" });
    this.idleTime = 0;

    function frame() {
      var dt = Math.min(self.clock.getDelta(), 0.05);
      self.idleTime += dt;

      if (LabState.currentMode === "IDLE") {
        if (!self.pointerActive && !REDUCED) {
          /* gentle sweep when nobody is driving */
          var a = 0.45 + Math.sin(self.idleTime * 0.32) * 0.5;
          self.idleTarget.set(Math.sin(a) * 1.45, 1.0 + Math.sin(self.idleTime * 0.5) * 0.18, Math.cos(a) * 1.45);
          self.robot.setRoll(a);
        }
        self.robot.setTarget(self.idleTarget);
      } else {
        self.updatePhase(dt);
      }

      self.robot.update(dt, LabState.currentMode === "IDLE" ? self.idleTime : null);

      var free = !LabState.isAttached;
      for (var i = 0; i < self.parcels.length; i++) {
        var p = self.parcels[i];
        p.update(dt, free || p !== LabState.selectedParcel);
        if (p.reticle) {
          p.reticle.material.opacity = p.hover * 0.55;
          p.reticle.visible = p.hover > 0.01;
        }
      }

      self.rig.update(dt, self.pointer, LabState.currentMode === "IDLE");
      self.renderer.render(self.scene, self.camera);
      window.requestAnimationFrame(frame);
    }
    frame();
  };

  /* ======================================================================
     12. BOOT
     ====================================================================== */
  function webglAvailable() {
    try {
      var c = document.createElement("canvas");
      return !!(window.WebGLRenderingContext &&
        (c.getContext("webgl") || c.getContext("experimental-webgl")));
    } catch (e) { return false; }
  }

  function renderFallback() {
    var host = document.getElementById("fallback-body");
    host.innerHTML = DATA.sections.map(function (s) {
      return '<section class="block panel-body" aria-labelledby="fb-' + s.id + '">' +
        '<span class="tag" id="fb-' + s.id + '">Section ' + s.num + "</span>" +
        Content.render(s.id) + "</section>";
    }).join("");
    /* the fallback document carries several h1s named content-heading; keep one */
    var heads = host.querySelectorAll("#content-heading");
    for (var i = 1; i < heads.length; i++) heads[i].removeAttribute("id");
    var qa = host.querySelector("#stage-tabs");
    if (qa) UI.initQALab(host);
    var skip = document.getElementById("skip-link");
    if (skip) { skip.setAttribute("href", "#fallback"); skip.textContent = "Skip to portfolio content"; }
    document.body.classList.add("is-fallback");
  }

  function runLoader(done) {
    var bar = document.getElementById("boot-bar");
    var ready = document.getElementById("boot-ready");
    var lines = document.querySelectorAll("[data-boot]");
    var i = 0;
    var step = REDUCED ? 40 : 190;

    (function tick() {
      if (i < lines.length) {
        lines[i].classList.add("on");
        i++;
        bar.style.width = Math.round(i / lines.length * 100) + "%";
        window.setTimeout(tick, step);
      } else {
        ready.classList.add("on");
        window.setTimeout(function () {
          document.getElementById("loader").classList.add("done");
          done();
        }, REDUCED ? 60 : 420);
      }
    })();
  }

  function boot() {
    if (!window.THREE || !webglAvailable()) {
      UI.init(function () {}, function () {});
      renderFallback();
      return;
    }
    var lab;
    try {
      lab = new Lab(document.getElementById("scene-canvas"));
    } catch (err) {
      /* eslint-disable no-console */
      console.warn("3D laboratory could not start:", err);
      UI.init(function () {}, function () {});
      renderFallback();
      return;
    }

    UI.init(
      function (id) { lab.select(id); },
      function () { lab.leave(); }
    );
    UI.onNavHover = function (id) {
      if (LabState.currentMode !== "IDLE") return;
      var p = id ? lab.parcels.filter(function (x) { return x.section.id === id; })[0] : null;
      lab.setHover(p || null);
      if (p) {
        lab.robot.setRoll(p.homeYaw);
        lab.idleTarget.copy(p.homePosition).setY(p.homePosition.y + 0.55);
      }
    };

    runLoader(function () { lab.start(); });
  }

  /* Parcel labels are drawn to canvas, so the webfonts must be ready first. */
  function whenFontsReady(cb) {
    var fired = false;
    function go() { if (!fired) { fired = true; cb(); } }
    if (document.fonts && document.fonts.ready && document.fonts.ready.then) {
      document.fonts.ready.then(go)["catch"](go);
    }
    window.setTimeout(go, 1500);
  }

  function ready() { whenFontsReady(boot); }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ready);
  } else {
    ready();
  }
})();
