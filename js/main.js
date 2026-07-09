// Hamburger Menu
const hamburger = document.querySelector('.hamburger');
const navMenu = document.querySelector('.nav-menu');
const navLinks = document.querySelectorAll('.nav-link');

hamburger.addEventListener('click', () => {
    navMenu.classList.toggle('active');
    hamburger.classList.toggle('active');
});

navLinks.forEach(link => {
    link.addEventListener('click', () => {
        navMenu.classList.remove('active');
        hamburger.classList.remove('active');
    });
});

// Scroll Progress Bar
window.addEventListener('scroll', () => {
    const scrollProgress = document.querySelector('.scroll-progress');
    const scrollTop = window.scrollY;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const scrollPercent = (scrollTop / docHeight) * 100;
    scrollProgress.style.width = scrollPercent + '%';

    // Back to Top Button
    const backToTop = document.querySelector('.back-to-top');
    if (scrollTop > 300) {
        backToTop.classList.add('show');
    } else {
        backToTop.classList.remove('show');
    }
});

// Back to Top Function
function scrollToTop() {
    window.scrollTo({
        top: 0,
        behavior: 'smooth'
    });
}

// Carousel
let currentSlide = 0;
const slides = document.querySelectorAll('.carousel-slide');

function moveCarousel(direction) {
    currentSlide += direction;

    if (currentSlide >= slides.length) {
        currentSlide = 0;
    } else if (currentSlide < 0) {
        currentSlide = slides.length - 1;
    }

    const track = document.querySelector('.carousel-track');
    track.style.transform = `translateX(-${currentSlide * 100}%)`;
}

// Auto rotate carousel every 5 seconds
setInterval(() => {
    moveCarousel(1);
}, 5000);

// FAQ Accordion
const faqItems = document.querySelectorAll('.faq-item');

faqItems.forEach(item => {
    const question = item.querySelector('.faq-question');

    question.addEventListener('click', () => {
        // Close other items
        faqItems.forEach(otherItem => {
            if (otherItem !== item) {
                otherItem.classList.remove('active');
            }
        });

        // Toggle current item
        item.classList.toggle('active');
    });
});

// AOS (Animate On Scroll) Initialization
AOS.init({
    duration: 1000,
    once: true,
    offset: 100,
    easing: 'ease-in-out'
});

// Counter Animation
function animateCounter(element, target, duration = 2000) {
    let current = 0;
    const increment = target / (duration / 16);

    const counter = setInterval(() => {
        current += increment;
        if (current >= target) {
            element.textContent = target;
            clearInterval(counter);
        } else {
            element.textContent = Math.floor(current);
        }
    }, 16);
}

// Trigger counter animation when section is in view
const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const counters = entry.target.querySelectorAll('[data-counter]');
            counters.forEach(counter => {
                const target = parseInt(counter.dataset.counter);
                animateCounter(counter, target);
            });
            observer.unobserve(entry.target);
        }
    });
});

const statsSection = document.querySelector('.stats');
if (statsSection) {
    observer.observe(statsSection);
}

// Smooth scroll for anchor links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// Loading animation
window.addEventListener('load', () => {
    document.body.style.opacity = '1';
});

// Page transitions
const pages = {
    'home': 'index.html',
    'privacy': 'privacy.html',
    'terms': 'terms.html',
    'contact': 'contact.html'
};

function navigateTo(page) {
    if (pages[page]) {
        window.location.href = pages[page];
    }
}

// Mobile menu close on link click
document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => {
        document.querySelector('.nav-menu').classList.remove('active');
        document.querySelector('.hamburger').classList.remove('active');
    });
});

// Prevent scroll on body when menu is open
const toggleMenuScroll = () => {
    if (navMenu.classList.contains('active')) {
        document.body.style.overflow = 'hidden';
    } else {
        document.body.style.overflow = '';
    }
};

hamburger.addEventListener('click', toggleMenuScroll);

console.log('ClothMatics Website Loaded Successfully! ✅');
