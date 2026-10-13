(function () {
    const phone = document.querySelector('.app-phone');
    const features = document.querySelector('.features');
    if (!phone || !features) return;

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    let endScrollY = 0;

    function measure() {
        const featuresDocTop = features.getBoundingClientRect().top + window.scrollY;
        // scrollY at which the features section has scrolled 65% up the viewport -> progress reaches 1
        endScrollY = Math.max(featuresDocTop - window.innerHeight * 0.35, 1);
    }

    function update() {
        const progress = clamp(window.scrollY / endScrollY, 0, 1);
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
    measure();
    update();
})();
