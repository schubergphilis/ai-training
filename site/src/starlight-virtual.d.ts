/**
 * Starlight resolves `virtual:starlight/components/*` to the configured
 * component (the user's override, or its default) at build time, and its own
 * `Sidebar.astro` imports `MobileMenuFooter` that way. Starlight 0.43 ships no
 * type for the module, so `overrides/Sidebar.astro` needs this declaration to
 * pass `astro check`.
 */
declare module 'virtual:starlight/components/MobileMenuFooter' {
	const MobileMenuFooter: typeof import('@astrojs/starlight/components/MobileMenuFooter.astro').default;
	export default MobileMenuFooter;
}
