(function () {
    const phone = document.querySelector('.app-phone');
    const features = document.querySelector('.features');
    if (!phone || !features) return;

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    let featuresDocTop = 0;
    let maxScrollY = 0;

    function measure() {
        featuresDocTop = features.getBoundingClientRect().top + window.scrollY;
        maxScrollY = document.documentElement.scrollHeight - window.innerHeight;
    }

    function update() {
        const vh = window.innerHeight;
        // 0 when the features section enters the bottom of the screen, 1 once it has risen 65% up the screen
        let progress = (window.scrollY + vh - featuresDocTop) / (vh * 0.65);
        // On tall screens the page may not scroll that far, so always finish at the bottom of the page
        if (maxScrollY > 1) progress = Math.max(progress, window.scrollY / maxScrollY);
        else progress = 1;
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) progress = 1;
        progress = clamp(progress, 0, 1);
        phone.style.setProperty('--phone-progress', progress.toFixed(4));
    }

    let ticking = false;
    function onScroll() {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(function () {
            update();
            ticking = false;
        });
    }

    function onResize() {
        measure();
        update();
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    window.addEventListener('load', onResize);
    measure();
    update();
})();

// Fade sections in as they scroll into view
(function () {
    const items = document.querySelectorAll('[data-reveal]');
    if (!items.length) return;

    if (!('IntersectionObserver' in window)) {
        items.forEach(function (el) { el.classList.add('is-visible'); });
        return;
    }

    const observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
            if (!entry.isIntersecting) return;
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
        });
    }, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' });

    items.forEach(function (el) { observer.observe(el); });
})();

// Steps section: each card deals face-down, flips face-up once when it first
// scrolls into view (handled by the shared [data-reveal] observer below,
// which adds .is-visible permanently). After that, clicking/tapping flips a
// card to its back as a one-off "peek" — and scrolling in either direction
// resets any flipped card back to its front, so the back never gets stuck.
(function () {
    const cards = document.querySelectorAll('.steps-grid .card-flip');
    if (!cards.length) return;

    const resetters = [];

    cards.forEach(function (flip) {
        const li = flip.closest('[data-reveal]');
        const front = flip.querySelector('.card-face--front');
        const back = flip.querySelector('.card-face--back');
        if (!li) return;

        // The entrance stagger lives in --flip-delay; once that first flip-in
        // transition has had time to finish, zero the delay out so later
        // clicks snap immediately instead of inheriting the same stagger.
        function clearDelayAfterEntrance() {
            const raw = getComputedStyle(li).getPropertyValue('--flip-delay').trim();
            const delayMs = parseFloat(raw) || 0;
            setTimeout(function () {
                li.style.setProperty('--flip-delay', '0ms');
            }, delayMs + 950);
        }

        if (li.classList.contains('is-visible')) {
            clearDelayAfterEntrance();
        } else if ('MutationObserver' in window) {
            const mo = new MutationObserver(function () {
                if (li.classList.contains('is-visible')) {
                    clearDelayAfterEntrance();
                    mo.disconnect();
                }
            });
            mo.observe(li, { attributes: true, attributeFilter: ['class'] });
        }

        function setFlipped(flipped) {
            li.classList.toggle('is-flipped', flipped);
            flip.setAttribute('aria-pressed', String(flipped));
            if (front) front.setAttribute('aria-hidden', String(flipped));
            if (back) back.setAttribute('aria-hidden', String(!flipped));
        }

        function toggle() {
            if (!li.classList.contains('is-visible')) return;
            setFlipped(!li.classList.contains('is-flipped'));
        }

        flip.addEventListener('click', toggle);
        flip.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggle();
            }
        });

        resetters.push(function () {
            if (li.classList.contains('is-flipped')) setFlipped(false);
        });
    });

    let ticking = false;
    function resetFlippedOnScroll() {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(function () {
            resetters.forEach(function (reset) { reset(); });
            ticking = false;
        });
    }

    window.addEventListener('scroll', resetFlippedOnScroll, { passive: true });
})();

// Discover section: scrolling turns the road and brings each town to the top
(function () {
    const section = document.querySelector('.discover');
    if (!section) return;

    const sticky = section.querySelector('.discover-sticky');
    const stage = section.querySelector('.road-stage');
    const dashes = section.querySelector('.road-dashes');
    const items = Array.from(section.querySelectorAll('.road-towns li'));
    const buttons = items.map(function (li) { return li.querySelector('.town'); });
    const pin = section.querySelector('.d-icon--pin');
    const hint = section.querySelector('.road-hint');
    const status = section.querySelector('#town-status');
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const count = items.length;

    const svg = section.querySelector('.road-svg');
    const roadBase = section.querySelector('.road-base');

    // Road geometry in stage units (stage is 1000 wide); values come from CSS so each breakpoint can differ
    const CENTER_X = 500;
    let geo = null;

    function readGeometry() {
        const cs = getComputedStyle(stage);
        const num = function (name) { return parseFloat(cs.getPropertyValue(name)); };
        geo = {
            vbH: num('--vb-h'),
            cy: num('--cy'),
            roadR: num('--road-r'),
            band: num('--road-band'),
            labelCy: num('--label-cy'),
            labelR: num('--label-r'),
            step: num('--step')
        };
        svg.setAttribute('viewBox', '0 0 1000 ' + geo.vbH);
        [roadBase, dashes].forEach(function (c) {
            c.setAttribute('cy', geo.cy);
            c.setAttribute('r', geo.roadR);
        });
        roadBase.setAttribute('stroke-width', geo.band);
        dashes.setAttribute('stroke-width', Math.round(geo.band * 0.1));
    }

    let current = 0;   // position shown on screen (eases toward target)
    let target = 0;    // position the scroll asks for
    let active = -1;
    let rafId = 0;

    function clamp(v, min, max) {
        return Math.max(min, Math.min(max, v));
    }

    function smoothstep(edge0, edge1, x) {
        const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
        return t * t * (3 - 2 * t);
    }

    function isPinned() {
        return getComputedStyle(sticky).position === 'sticky';
    }

    function scrollProgress() {
        const rect = section.getBoundingClientRect();
        const vh = window.innerHeight;
        if (isPinned()) {
            const travel = section.offsetHeight - vh;
            return travel > 0 ? clamp(-rect.top / travel, 0, 1) : 0;
        }
        // Not pinned (short screens): turn while the section passes through the screen
        return clamp((vh * 0.85 - rect.top) / Math.max(rect.height, 1), 0, 1);
    }

    // Each town "holds" for a stretch of scrolling before the road moves on
    function progressToPosition(p) {
        const raw = p * (count - 1);
        const i = Math.floor(raw);
        if (i >= count - 1) return count - 1;
        return i + smoothstep(0.3, 0.7, raw - i);
    }

    function layout() {
        const width = stage.clientWidth;
        const scale = width / 1000;
        const step = geo.step;          // degrees between towns
        const maxAngle = 80;            // fade out past this angle
        const visibleHalf = Math.min(width, sticky.clientWidth) / 2;
        // Active name is ~1.45x the others (as in the mockup), but never smaller than 16px
        const baseFont = clamp(width * 0.02, 11, 19);
        const activeScale = clamp(width * 0.029, 16, 28) / baseFont;

        items.forEach(function (li, i) {
            const angle = (i - current) * step;
            const rad = angle * Math.PI / 180;
            const x = (CENTER_X + geo.labelR * Math.sin(rad)) * scale;
            const y = (geo.labelCy - geo.labelR * Math.cos(rad)) * scale;
            const nearness = Math.max(0, 1 - Math.abs(i - current));
            const size = 1 + (activeScale - 1) * nearness;
            const a = Math.abs(angle);
            // Fade near the end of the arc, and before a name would be cut off by the screen edge
            const halfLabel = li.offsetWidth * size / 2;
            const edgeRoom = visibleHalf - Math.abs(x - width / 2) - halfLabel;
            const opacity = a >= maxAngle ? 0 : Math.min(clamp((maxAngle - a) / 18, 0, 1), clamp(edgeRoom / 16, 0, 1));

            li.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px) translate(-50%, -50%) scale(' + size.toFixed(3) + ')';
            li.style.opacity = opacity.toFixed(3);
            li.style.pointerEvents = opacity < 0.2 ? 'none' : '';
        });

        dashes.setAttribute('transform', 'rotate(' + (-current * step).toFixed(2) + ' ' + CENTER_X + ' ' + geo.cy + ')');

        const nowActive = Math.round(current);
        if (nowActive !== active) {
            if (active !== -1) {
                pin.classList.remove('is-bouncing');
                void pin.offsetWidth;
                pin.classList.add('is-bouncing');
            }
            active = nowActive;
            buttons.forEach(function (b, i) {
                b.classList.toggle('is-active', i === active);
                if (i === active) b.setAttribute('aria-current', 'true');
                else b.removeAttribute('aria-current');
            });
            status.textContent = 'Now showing ' + buttons[active].textContent;
        }

        hint.classList.toggle('is-hidden', target > 0.15);
    }

    function tick() {
        const diff = target - current;
        if (reduceMotion.matches || Math.abs(diff) < 0.001) {
            current = target;
            rafId = 0;
            layout();
            return;
        }
        current += diff * 0.16;
        layout();
        rafId = requestAnimationFrame(tick);
    }

    function onScroll() {
        target = progressToPosition(scrollProgress());
        if (!rafId) rafId = requestAnimationFrame(tick);
    }

    // Jump the page to the scroll position where a given town sits at the top
    function goTo(index) {
        index = clamp(index, 0, count - 1);
        const p = index / (count - 1);
        const docTop = section.getBoundingClientRect().top + window.scrollY;
        let top;
        if (isPinned()) {
            top = docTop + p * (section.offsetHeight - window.innerHeight);
        } else {
            target = index;
            if (!rafId) rafId = requestAnimationFrame(tick);
            return;
        }
        window.scrollTo({ top: top, behavior: reduceMotion.matches ? 'auto' : 'smooth' });
    }

    buttons.forEach(function (btn, i) {
        btn.addEventListener('click', function () { goTo(i); });
        btn.addEventListener('keydown', function (e) {
            let next = null;
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = i + 1;
            if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = i - 1;
            if (next === null || next < 0 || next >= count) return;
            e.preventDefault();
            goTo(next);
            buttons[next].focus({ preventScroll: true });
        });
    });

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', function () {
        readGeometry();
        onScroll();
        layout();
    });

    readGeometry();
    target = current = progressToPosition(scrollProgress());
    layout();
})();

// About page: stat numbers count up from 0 once scrolled into view
(function () {
    const nums = document.querySelectorAll('.about-stat-num[data-count]');
    if (!nums.length) return;

    if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        nums.forEach(function (el) { el.textContent = el.getAttribute('data-count'); });
        return;
    }

    function animateCount(el) {
        const target = parseInt(el.getAttribute('data-count'), 10) || 0;
        const duration = 1100;
        let start = null;

        function step(ts) {
            if (!start) start = ts;
            const progress = Math.min((ts - start) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            el.textContent = Math.round(eased * target);
            if (progress < 1) requestAnimationFrame(step);
        }

        requestAnimationFrame(step);
    }

    const observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
            if (!entry.isIntersecting) return;
            animateCount(entry.target);
            observer.unobserve(entry.target);
        });
    }, { threshold: 0.6 });

    nums.forEach(function (el) { observer.observe(el); });
})();

// Support page: FAQ accordion
(function () {
    const items = document.querySelectorAll('.faq-item');
    if (!items.length) return;

    items.forEach(function (item) {
        const q = item.querySelector('.faq-q');
        if (!q) return;
        q.addEventListener('click', function () {
            const open = item.classList.toggle('is-open');
            q.setAttribute('aria-expanded', String(open));
        });
    });
})();
