/**
 * Synvorax Labs — GSAP Animations
 */

const Animations = (() => {
  let catalog = null;

  function init(data) {
    catalog = data;
    if (typeof gsap === 'undefined') return;

    gsap.registerPlugin(ScrollTrigger);
    animateHero();
    initScrollReveals();
    initCounterAnimations();
    initParallax();
    animateFooter();
  }

  function animateHero() {
    const targets = ['.hero__eyebrow', '.hero__title-line', '.hero__title-accent', '.hero__description', '.hero__buttons .btn'];

    gsap.set(targets, { opacity: 0, y: 30 });

    gsap.timeline({ delay: 0.3 })
      .to('.hero__eyebrow', { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out' })
      .to('.hero__title-line', { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out' }, '-=0.5')
      .to('.hero__title-accent', { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out' }, '-=0.6')
      .to('.hero__description', { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out' }, '-=0.5')
      .to('.hero__buttons .btn', {
        opacity: 1,
        y: 0,
        duration: 0.6,
        stagger: 0.15,
        ease: 'power3.out',
      }, '-=0.4');
  }

  function initScrollReveals() {
    gsap.utils.toArray('.reveal').forEach((el) => {
      gsap.fromTo(el,
        { opacity: 0, y: 40 },
        {
          opacity: 1,
          y: 0,
          duration: 0.8,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: el,
            start: 'top 85%',
            toggleActions: 'play none none none',
          },
          onComplete: () => el.classList.add('revealed'),
        }
      );
    });

    gsap.utils.toArray('.section-title').forEach((el) => {
      gsap.fromTo(el,
        { opacity: 0, y: 30 },
        {
          opacity: 1,
          y: 0,
          duration: 0.8,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: el,
            start: 'top 85%',
          },
        }
      );
    });

    gsap.utils.toArray('.eyebrow').forEach((el) => {
      if (el.closest('.hero')) return;
      gsap.fromTo(el,
        { opacity: 0, x: -20 },
        {
          opacity: 1,
          x: 0,
          duration: 0.6,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: el,
            start: 'top 90%',
          },
        }
      );
    });
  }

  function revealElements(elements) {
    elements.forEach((el, i) => {
      gsap.fromTo(el,
        { opacity: 0, y: 30 },
        {
          opacity: 1,
          y: 0,
          duration: 0.6,
          delay: i * 0.08,
          ease: 'power3.out',
          onComplete: () => el.classList.add('revealed'),
        }
      );
    });
  }

  function initCounterAnimations() {
    document.querySelectorAll('.stat-card__value').forEach((el) => {
      const target = parseFloat(el.dataset.target);
      const suffix = el.dataset.suffix || '';
      const obj = { val: 0 };

      gsap.to(obj, {
        val: target,
        duration: 2.5,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: el,
          start: 'top 80%',
        },
        onUpdate: () => {
          const display = target >= 10 ? Math.floor(obj.val) : obj.val.toFixed(1);
          el.textContent = `${display}${suffix}`;
        },
      });
    });
  }

  function initParallax() {
    gsap.to('.gradient-orb--1', {
      y: -100,
      scrollTrigger: {
        trigger: 'body',
        start: 'top top',
        end: 'bottom bottom',
        scrub: 1,
      },
    });

    gsap.to('.gradient-orb--2', {
      y: 80,
      scrollTrigger: {
        trigger: 'body',
        start: 'top top',
        end: 'bottom bottom',
        scrub: 1.5,
      },
    });

    gsap.to('.hero__visual', {
      y: -60,
      scrollTrigger: {
        trigger: '.hero',
        start: 'top top',
        end: 'bottom top',
        scrub: 1,
      },
    });
  }

  function animateFooter() {
    gsap.to('.footer__grid > *', {
      opacity: 1,
      y: 0,
      duration: 0.6,
      stagger: 0.1,
      ease: 'power3.out',
      scrollTrigger: {
        trigger: '.footer',
        start: 'top 85%',
      },
    });
  }

  function openModal(container) {
    gsap.fromTo(container,
      { scale: 0.95, y: 20, opacity: 0 },
      { scale: 1, y: 0, opacity: 1, duration: 0.4, ease: 'power3.out' }
    );
  }

  function closeModal(container, callback) {
    gsap.to(container, {
      scale: 0.95,
      y: 20,
      opacity: 0,
      duration: 0.3,
      ease: 'power2.in',
      onComplete: callback,
    });
  }

  return { init, revealElements, openModal, closeModal };
})();

window.Animations = Animations;
