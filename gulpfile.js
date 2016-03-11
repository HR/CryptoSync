var gulp = require('gulp'),
		shell = require('gulp-shell');

gulp.task('default', shell.task([
	// Absolute path '/usr/local/lib/node_modules/electron-prebuilt/dist/Electron.app/Contents/MacOS/Electron .'
	// Run electron
	// TODO: add compile less bash command > "for i in static/style/*.less; do lessc $i ${i:0:${#i} - 5}.css; done"
	// 'ELECTRON_RUN_AS_NODE=true node_modules/electron-prebuilt/dist/Electron.app/Contents/MacOS/Electron node_modules/node-inspector/bin/inspector.js'
	'node_modules/electron-prebuilt/dist/Electron.app/Contents/MacOS/Electron --debug=5858 .'
	// 'node_modules/electron-prebuilt/dist/Electron.app/Contents/MacOS/Electron --debug-brk=5858 .'
]));

gulp.task('rebuildni', shell.task([
	// start node inspector server
	'node_modules/.bin/node-pre-gyp --target=$(node_modules/electron-prebuilt/dist/Electron.app/Contents/MacOS/Electron -v | sed s/\v//g) --runtime=electron --fallback-to-build --directory node_modules/v8-debug/ --dist-url=https://atom.io/download/atom-shell reinstall && node_modules/.bin/node-pre-gyp --target=$(node_modules/electron-prebuilt/dist/Electron.app/Contents/MacOS/Electron -v | sed s/\v//g) --runtime=electron --fallback-to-build --directory node_modules/v8-profiler/ --dist-url=https://atom.io/download/atom-shell reinstall'
]));


gulp.task('ni', shell.task([
	// start node inspector server
	'ELECTRON_RUN_AS_NODE=true node_modules/electron-prebuilt/dist/Electron.app/Contents/MacOS/Electron node_modules/node-inspector/bin/inspector.js'
]));

gulp.task('driver', shell.task([
	// Run chromedriver
	'./node_modules/chromedriver/bin/chromedriver'
]));

gulp.task('test', shell.task([
	// Run test stuff
]));

gulp.task('watch', function() {
	gulp.watch(['./static/**/*', './*.js'], ['run']);
});

gulp.task('run', function(){
	return gulp.src('*', {read: false})
	 .pipe(shell([
		// start electron main and render process
		'node_modules/electron-prebuilt/dist/Electron.app/Contents/MacOS/Electron .'
	]));
});

gulp.task('lint', function(){
	return gulp.src('*', {read: false})
	 .pipe(shell([
		// lint
		'eslint src/*.js src/*/*.js *.js'
	]));
});
