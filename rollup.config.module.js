export default {
    input: 'build/index.js',
    external: [
        'rxjs',
        'rxjs/operators'
    ],
    output: {
        file: 'module.js',
        format: 'esm'
    }
};
