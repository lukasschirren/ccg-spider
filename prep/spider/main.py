from pathlib import Path

import geopandas as gpd
import yaml
from typer import Option, echo, run

from spider.features import add_features, create_hex
from spider.neighbors import add_neighbors

cfg_default = Path(__file__).parents[1] / "config.yml"


def feat(
    file: Path,
    config: Path = Option(cfg_default, help="Path to config file"),
    append: bool = Option(False),
) -> None:
    """Add features."""

    file = Path(file)
    if file.suffix != ".geojson":
        echo("File must be a GeoJSON! eg 'processed/hex.geojson'")
        return

    with config.open() as f:
        cfg = yaml.safe_load(f)

    if append and file.exists():
        echo("Loading and appending to existing file")
        geom = gpd.read_file(file)
    else:
        echo("Creating a new hex geometry from scratch")
        geom = gpd.read_file(cfg["aoi"])
        geom = create_hex(geom, cfg["hex_res"],0,500)
        geom = add_neighbors(geom)

    if "features" in cfg and isinstance(cfg["features"], list):
        echo("Adding features...")
        geom = add_features(geom, cfg["features"], cfg["raster_like"])
    else:
        echo("No features to add")

    geom["index"] = geom.index
    geom = geom.dropna(axis=0, subset=["geometry"])

    echo(f"Saving to {file}")
    geom.to_file(file, driver="GeoJSON")


def cli() -> None:
    run(feat)
