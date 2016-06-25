.PHONY += all
all: scrolling-gestures.xpi

.PHONY += clean
clean:
	@rm ./scrolling-gestures.xpi
	@rm ./icon.png
	@rm ./icon64.png

icon.png: icon.svg
	inkscape -e icon.png_ -w 48 icon.svg
	pngcrush icon.png_ icon.png
	rm -f icon.png_
icon64.png: icon.svg
	inkscape -e icon64.png_ -w 64 icon.svg
	pngcrush icon64.png_ icon64.png
	rm -f icon64.png_

test: all
	jpm run -b ~/opt/firefox/firefox

dist: scrolling-gestures.xpi

scrolling-gestures.xpi: package.json lib/main.js icon.png icon64.png
	perl update-buildnum.pl package.json
	jpm xpi
	mv jid0-xXJ39NPeSBeN8zbjffQa2GIA7kQ@jetpack-*.xpi $@

install: scrolling-gestures.xpi
	firefox scrolling-gestures.xpi
