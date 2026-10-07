# SketchDex

A cross-game Pokémon search tool that runs entirely in the browser. All data is
loaded up front, so results update immediately as filters are added, combined,
and removed.

## Development

```sh
npm install
npm run dev        # start the dev server
npm test           # run the test suite
npm run lint
npm run build      # type-check and build to dist/
```

`npm run q` evaluates a query against the committed data and prints the matching
forms with the games each matches in:

```sh
npm run q -- "gen 3 & type:water & bst >= 530"
```

## Images

All images are committed, under `public/images`: box sprites (`box`, and `sprites`
for some Mega Evolutions), Ken Sugimori's artwork (`art`), shiny recolors by
[tonofdirt726](https://tonofdirt726.imgbb.com/albums) (`shiny`), and Pokémon HOME's
sprites (`home`, `home-shiny`).

## Deployment

`.github/workflows/deploy.yml` publishes `main` to GitHub Pages. The site is built
with `BASE_PATH` set to the path it is served under (`/<repository>/`).

## Data

The data is committed, under `public/data/`, with the names in other languages under
`public/data/i18n/`.
