import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { useLocation } from 'react-router-native';
import { HIDE, isDrillDown, useAppBarVisibility } from './AppBarVisibility';

/**
 * The white fade every page's content runs out through at the bottom edge.
 *
 * It exists because the AppBar floats: pages scroll UNDER it rather than above it,
 * so without this a row is cut off by the hard top edge of a pill that is not part
 * of the page. The fade turns that collision into a page that runs out of light.
 *
 * Lives in the shell, not in the routes. Every screen has the same bar over the same
 * white, so a scrim per page would be the same 20 lines six times and would go
 * missing on the seventh.
 */

// Page white. --foreground, from tokens.cjs. Read as a literal rather than a var()
// because this is a colour PROP on a native gradient, not a style — expo-linear-
// gradient parses the strings itself and knows nothing about CSS variables.
const WHITE = '#ffffff';

// NOT 'transparent', and not rgba(0,0,0,0). The keyword resolves to transparent
// BLACK, and a gradient interpolates all four channels — so the top half of the fade
// comes out a grey haze over the content instead of clear. Transparent white is the
// same colour as the bottom stop with the alpha taken off it, which is what makes the
// ramp invisible at the top.
const CLEAR_WHITE = 'rgba(255,255,255,0)';

// The bar sits at bottom-6 (24) and runs ~68 tall, so its top edge is 92 up. This used
// to be 96, level with that edge, so the ramp began exactly where the bar began.
//
// 72 keeps the ramp wholly below it. That sounds like it defeats the point and does
// not: the bar is 87% wide with rounded ends, so the gutters either side of it and the
// 24 beneath it are open page, and that is the whole of where this is ever seen. What
// the extra 24 was buying was a ramp starting above the bar — visible only as a haze
// on the row above it, which at STRENGTH 0.5 was not doing enough to pay for reaching
// that far up the screen.
const SCRIM_HEIGHT = 72;

// Under the bar (50) and over the routes, which set none. The fade is the bar's
// backdrop; it must never be drawn on top of the thing it is backing.
const SCRIM_Z = 40;

// How solid the fade gets at its strongest, before the bar's own hide animation is
// applied on top. Held under 1 on purpose: at full strength the ramp reads as a white
// band across the foot of the screen rather than as the page running out of light, and
// the last row of a list disappears further up than it needs to.
//
// Raised from 0.5 to 0.8. At 0.5 this was a veil — content stayed clearly readable in
// the gutters either side of the bar, which cut both ways: a row could be legible under
// the bar while being untappable, because the bar is opaque and sits over it. 0.8 keeps
// the ramp short of a hard band while taking that half-readable strip out, so what the
// eye can still make out down there is roughly what the thumb can still reach.
const STRENGTH = 0.8;

// Where the ramp reaches full white, as a fraction of the height above. A gradient
// that only gets there at the last pixel spends its whole height nearly clear, so
// content stays legible right up against the bar and the scrim does nothing.
// Landing it at 0.7 gives the bar a solid base to sit on and puts the visible part
// of the ramp where the eye actually is.
const SOLID_AT = 0.7;

const AppBarScrim = () => {
  const { hidden } = useAppBarVisibility();
  const { pathname } = useLocation();

  // Leaves with the bar, on the bar's own curve. Once the bar has gone the scrim is
  // veiling content for nothing — the whole point of the bar sliding off is to hand
  // that strip of screen back, and a fade left behind would take half of it again.
  const fade = useAnimatedStyle(() => ({
    opacity: withTiming((1 - hidden.value) * STRENGTH, HIDE),
  }));

  // And it leaves entirely where the bar never appears. This is a white fade with a
  // fixed colour and a height measured off the bar; a screen with no bar has nothing
  // for it to back, so it would be a white ramp over that page's own background and,
  // at zIndex 40, a lid over anything the page pinned beneath it.
  //
  // Below the hook, so the animated style is created on every render this component
  // has — see the same note in AppBar.
  if (isDrillDown(pathname)) return null;

  return (
    // pointerEvents="none" is load-bearing: this covers the bottom 160px of every
    // screen, and without it the scrim would swallow every tap aimed at the last row
    // of a list — including the one row a captain is most likely to be reaching for.
    <Animated.View
      pointerEvents="none"
      style={[
        { position: 'absolute', left: 0, right: 0, bottom: 0, height: SCRIM_HEIGHT, zIndex: SCRIM_Z },
        fade,
      ]}
    >
      <LinearGradient
        colors={[CLEAR_WHITE, WHITE]}
        locations={[0, SOLID_AT]}
        style={{ flex: 1 }}
      />
    </Animated.View>
  );
};

export default AppBarScrim;
