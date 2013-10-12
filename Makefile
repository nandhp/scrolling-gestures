all: icon.png icon64.png

icon.png: icon.svg
	inkscape -e icon.png_ -w 48 icon.svg
	pngcrush icon.png_ icon.png
	rm -f icon.png_
icon64.png: icon.svg
	inkscape -e icon64.png_ -w 64 icon.svg
	pngcrush icon64.png_ icon64.png
	rm -f icon64.png_

test: all
	cfx run
dist: scrolling-gestures.xpi

scrolling-gestures.xpi: all
	perl update-buildnum.pl package.json
	cfx xpi

install: scrolling-gestures.xpi
	firefox scrolling-gestures.xpi
