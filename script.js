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
