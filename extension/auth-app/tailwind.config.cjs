const defaultTheme = require('tailwindcss/defaultTheme')

const colors = {
    primary: { light: '#33D17E', DEFAULT: '#00c65e' },
    warning: '#ffd567',
    error: '#ED5454',
    palette: {
        100: '#f5f7f7',
        200: '#d4dddb',
        300: '#9e9e9e',
        400: '#555555',
        500: '#242424',
        600: '#0d0d0d',
    },
}

module.exports = {
    content: ['./index.html', './src/**/*.{js,svelte}'],
    theme: {
        backgroundColor: (theme) => ({ ...theme('colors'), ...colors }),
        borderColor: (theme) => ({ ...theme('colors'), ...colors }),
        textColor: (theme) => ({ ...theme('colors'), ...colors }),
        screens: {
            xs: '475px',
            ...defaultTheme.screens,
        },
        extend: {
            fontFamily: {
                sourcesans: ['source_sans'],
                sora: ['soraregular'],
            },
        },
    },
    variants: {},
    plugins: [],
}
