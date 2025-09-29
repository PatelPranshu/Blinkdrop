// Icons
const sunIcon = document.getElementById('theme-toggle-light-icon');
const moonIcon = document.getElementById('theme-toggle-dark-icon');
const themeToggleBtn = document.getElementById('theme-toggle');

// Theme variables from localStorage
const userTheme = localStorage.getItem('theme');
const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches;

// Initial Theme Check
const themeCheck = () => {
    if (userTheme === 'dark' || (!userTheme && systemTheme)) {
        document.documentElement.classList.add('dark');
        moonIcon.classList.add('hidden');
        sunIcon.classList.remove('hidden');
        return;
    }
    sunIcon.classList.add('hidden');
    moonIcon.classList.remove('hidden');
};

// Manual Theme Switch
const themeSwitch = () => {
    if (document.documentElement.classList.contains('dark')) {
        document.documentElement.classList.remove('dark');
        localStorage.setItem('theme', 'light');
        sunIcon.classList.add('hidden');
        moonIcon.classList.remove('hidden');
    } else {
        document.documentElement.classList.add('dark');
        localStorage.setItem('theme', 'dark');
        moonIcon.classList.add('hidden');
        sunIcon.classList.remove('hidden');
    }
};

// Call theme switch on clicking the button
if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', themeSwitch);
}

// Invoke theme check on initial load
themeCheck();