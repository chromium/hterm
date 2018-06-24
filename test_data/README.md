# Various Test Data

These are test files for checking behavior/rendering of hterm.
They come from a bunch of random sources.

* [deva.txt](./deva.txt): From https://benizi.com/vim/devanagari/.
* [utf-8.html](./utf-8.html): UTF-8 sampler from
  http://kermitproject.org/utf8.html.
* [utf-8.txt](./utf-8.txt): Snippets from above page for easier testing.
* [utf-8.py](./utf-8.py): Script to dump ranges of Unicode characters.
* [unicode-sampler.txt](./unicode-sampler.txt): Unicode samples from
  http://sheet.shiar.nl/sample.

## VT Tests

These are used by [hterm_vt_canned_tests.js](../js/hterm_vt_canned_tests.js).

They were created via [Vttest](https://invisible-island.net/vttest/).

See the [hacking document](../doc/hack.md) and
[bin/vtscope.py](../bin/vtscope.py) for more details.

* [charsets.log](./charsets.log)
* [vttest-01.log](./vttest-02.log)
* [vttest-02.log](./vttest-02.log)
