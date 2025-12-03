/** @type {import('tailwindcss').Config} */
export default {
    content: [
        './src/**/*.{ts,tsx,js,jsx}',
        './public/**/*.{html,js}'
    ],
    // darkMode removed - now configured via @custom-variant in CSS for Tailwind v4
    theme: {
        extend: {
            fontFamily: {
                'cairo': ['Cairo', 'system-ui', 'sans-serif'],
                'inter': ['Inter', 'system-ui', 'sans-serif'],
            },
            colors: {
                primary: '#8B5CF6',
                secondary: '#F59E0B',
                dialogue: '#8B5CF6',
                science: '#06B6D4',
                talents: '#F59E0B',
            }
        },
    },
    plugins: []
}
