# Hindi typography

Both apps bundle Noto Sans Devanagari Regular (400), SemiBold (600), and Bold
(700), alongside the existing PP Mori family. Noto's restrained sans-serif
forms suit the existing interface while providing Devanagari shaping and
marks. Preserve PP Mori for Latin text and use Noto for Hindi glyphs.

The static TTF files were obtained from `@expo-google-fonts/noto-sans-devanagari`
version `0.4.1`. The upstream project is
https://github.com/notofonts/devanagari and the fonts use the SIL Open Font
License 1.1. A copy of the font license accompanies the files in each app's
font assets directory. Bundled fonts require no runtime font-service request.

When reviewing Hindi layouts, check vowel marks above and below the baseline,
multiline buttons, mixed Latin/Hindi language options, inputs, large device
text settings, and text weights. Keep accessible font scaling enabled.
