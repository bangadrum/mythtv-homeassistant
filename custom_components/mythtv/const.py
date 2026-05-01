"""Constants for the MythTV integration."""

DOMAIN = "mythtv"

# Config keys
CONF_HOST           = "host"
CONF_PORT           = "port"
CONF_UPCOMING_COUNT = "upcoming_count"
CONF_RECORDED_COUNT = "recorded_count"

# Defaults
DEFAULT_PORT           = 6544
DEFAULT_SCAN_INTERVAL  = 60   # seconds
DEFAULT_UPCOMING_COUNT = 10
DEFAULT_RECORDED_COUNT = 10

# Platforms
PLATFORMS = ["binary_sensor", "sensor"]

# Data store keys
COORDINATOR = "coordinator"
API         = "api"
