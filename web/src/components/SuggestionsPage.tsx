import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Card,
  CardContent,
  CardHeader,
  Typography,
  Alert,
  CircularProgress,
  Chip,
  Stack,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Divider,
  Paper,
  Button,
  IconButton,
} from "@mui/material";
import PsychologyIcon from "@mui/icons-material/Psychology";
import ScheduleIcon from "@mui/icons-material/Schedule";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import LocalHospitalIcon from "@mui/icons-material/LocalHospital";
import FitnessCenterIcon from "@mui/icons-material/FitnessCenter";
import LocationOnIcon from "@mui/icons-material/LocationOn";
import PhoneIcon from "@mui/icons-material/Phone";
import MapIcon from "@mui/icons-material/Map";
import dayjs from "dayjs";
import { ArduinoLog, supabase } from "../lib/supabaseClient";

type Severity = "NO TREMOR" | "MILD TREMOR" | "INTENSE TREMOR";

interface Analysis {
  totalReadings: number;
  bySeverity: Record<Severity, number>;
  tremorEpisodesPerDay: number;
  intenseEpisodesPerDay: number;
  peakHours: { hour: number; count: number; label: string }[];
  peakDays: { day: number; count: number; label: string }[];
  intenseShare: number;
  consultTherapist: boolean;
  consultReasons: string[];
  suggestedTherapies: string[];
}

const SEVERITY_ORDER: Severity[] = ["NO TREMOR", "MILD TREMOR", "INTENSE TREMOR"];
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// --- Nearby therapy (geolocation + OpenStreetMap Overpass) ---
export interface TherapyPlace {
  id: string;
  name: string;
  address: string;
  phone: string | null;
  distanceKm: number;
  lat: number;
  lon: number;
  type: string;
}

function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function getTag(el: { tags?: Record<string, string> }, key: string): string | null {
  const t = el.tags;
  if (!t) return null;
  return t[key] ?? t[key.replace(":", "_")] ?? null;
}

function formatAddress(tags: Record<string, string> | undefined): string {
  if (!tags) return "";
  const parts = [
    tags["addr:housenumber"],
    tags["addr:street"],
    tags["addr:city"],
    tags["addr:state"],
    tags["addr:postcode"],
    tags["addr:full"],
  ].filter(Boolean);
  return parts.join(", ") || "Address not listed";
}

async function fetchNearbyTherapy(
  userLat: number,
  userLon: number,
  radiusM = 25000
): Promise<TherapyPlace[]> {
  const overpassUrl = "https://overpass-api.de/api/interpreter";
  // Only physical therapy, occupational therapy, and rehabilitation — no dental, pharmacy, or generic clinics
  const query = `
[out:json][timeout:20];
(
  node["healthcare"="physiotherapist"](around:${radiusM},${userLat},${userLon});
  way["healthcare"="physiotherapist"](around:${radiusM},${userLat},${userLon});
  node["healthcare"="occupational_therapist"](around:${radiusM},${userLat},${userLon});
  way["healthcare"="occupational_therapist"](around:${radiusM},${userLat},${userLon});
  node["healthcare"="rehabilitation"](around:${radiusM},${userLat},${userLon});
  way["healthcare"="rehabilitation"](around:${radiusM},${userLat},${userLon});
);
out body center;
>;
out skel qt;
`.trim();

  const res = await fetch(overpassUrl, {
    method: "POST",
    body: "data=" + encodeURIComponent(query),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  if (!res.ok) throw new Error("Could not fetch nearby places.");
  const json = await res.json();
  const elements = json.elements || [];

  const places: TherapyPlace[] = [];
  const seen = new Set<string>();

  for (const el of elements) {
    const tags = el.tags || {};
    const name =
      tags.name ||
      tags["name:en"] ||
      (tags.healthcare ? `Healthcare (${tags.healthcare})` : null) ||
      (tags.amenity ? `Healthcare (${tags.amenity})` : null) ||
      "Unnamed";
    let lat: number, lon: number;
    if (el.type === "node") {
      lat = el.lat;
      lon = el.lon;
    } else if (el.center) {
      lat = el.center.lat;
      lon = el.center.lon;
    } else continue;

    const id = `${el.type}-${el.id}-${lat}-${lon}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const phone =
      getTag(el, "phone") ||
      getTag(el, "contact:phone") ||
      getTag(el, "contact:mobile") ||
      null;
    const address = formatAddress(tags);
    const distanceKm = haversineKm(userLat, userLon, lat, lon);
    const type = tags.healthcare || tags.amenity || "healthcare";

    places.push({
      id,
      name,
      address,
      phone,
      distanceKm,
      lat,
      lon,
      type,
    });
  }

  places.sort((a, b) => a.distanceKm - b.distanceKm);
  return places.slice(0, 15);
}

function analyzeLogs(logs: ArduinoLog[]): Analysis | null {
  if (!logs.length) return null;

  const bySeverity: Record<Severity, number> = {
    "NO TREMOR": 0,
    "MILD TREMOR": 0,
    "INTENSE TREMOR": 0,
  };

  const byHour: Record<number, number> = {};
  const byDay: Record<number, number> = {};
  const byDate: Record<string, { mild: number; intense: number }> = {};

  for (const log of logs) {
    const sev = (log.severity || "NO TREMOR") as Severity;
    if (SEVERITY_ORDER.includes(sev)) bySeverity[sev] += 1;

    const d = dayjs(log.created_at);
    const hour = d.hour();
    const day = d.day();
    const dateKey = d.format("YYYY-MM-DD");

    byHour[hour] = (byHour[hour] || 0) + 1;
    byDay[day] = (byDay[day] || 0) + 1;

    if (!byDate[dateKey]) byDate[dateKey] = { mild: 0, intense: 0 };
    if (sev === "MILD TREMOR") byDate[dateKey].mild += 1;
    if (sev === "INTENSE TREMOR") byDate[dateKey].intense += 1;
  }

  const totalTremor = bySeverity["MILD TREMOR"] + bySeverity["INTENSE TREMOR"];
  const totalReadings = logs.length;
  const intenseShare = totalReadings > 0 ? (bySeverity["INTENSE TREMOR"] / totalReadings) * 100 : 0;
  const numDays = Object.keys(byDate).length || 1;
  const tremorEpisodesPerDay = totalTremor / numDays;
  const intenseEpisodesPerDay = bySeverity["INTENSE TREMOR"] / numDays;

  const peakHours = Object.entries(byHour)
    .map(([hour, count]) => ({
      hour: Number(hour),
      count,
      label: `${Number(hour)}:00`,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const peakDays = Object.entries(byDay)
    .map(([day, count]) => ({
      day: Number(day),
      count,
      label: DAY_LABELS[Number(day)],
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const consultReasons: string[] = [];
  if (intenseShare >= 25) consultReasons.push("More than 25% of readings show intense tremor.");
  if (intenseEpisodesPerDay >= 10) consultReasons.push("High number of intense tremor episodes per day.");
  if (tremorEpisodesPerDay >= 50) consultReasons.push("Very frequent tremor episodes overall.");
  if (bySeverity["INTENSE TREMOR"] >= 20 && totalReadings >= 50)
    consultReasons.push("Recurring intense tremor detected over the period.");
  const consultTherapist = consultReasons.length > 0;

  const suggestedTherapies: string[] = [];
  if (bySeverity["INTENSE TREMOR"] > 0) {
    suggestedTherapies.push("Medication review with your neurologist to optimize tremor control.");
    suggestedTherapies.push("Physical or occupational therapy for daily activities and exercises.");
  }
  if (bySeverity["MILD TREMOR"] > bySeverity["INTENSE TREMOR"]) {
    suggestedTherapies.push("Stress reduction and relaxation techniques (e.g. mindfulness, breathing).");
    suggestedTherapies.push("Avoid caffeine and ensure good sleep; both can worsen tremor.");
  }
  suggestedTherapies.push("Keep a consistent monitoring schedule to track response to treatment.");
  if (intenseShare >= 15) {
    suggestedTherapies.push("Discuss advanced options (e.g. DBS or focused ultrasound) if tremor remains disabling.");
  }

  return {
    totalReadings,
    bySeverity,
    tremorEpisodesPerDay,
    intenseEpisodesPerDay,
    peakHours,
    peakDays,
    intenseShare,
    consultTherapist,
    consultReasons,
    suggestedTherapies: [...new Set(suggestedTherapies)],
  };
}

export default function SuggestionsPage() {
  const [logs, setLogs] = useState<ArduinoLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [nearbyPlaces, setNearbyPlaces] = useState<TherapyPlace[]>([]);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [nearbyError, setNearbyError] = useState<string | null>(null);
  const [locationDenied, setLocationDenied] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      const sinceIso = dayjs().subtract(3, "month").toISOString();
      const { data, error: e } = await supabase
        .from("arduino_logs")
        .select("id, created_at, gyro_mag, severity, vib_count")
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: true })
        .limit(10000);

      if (!isMounted) return;
      if (e) {
        setError(e.message);
        setLoading(false);
        return;
      }
      setLogs((data ?? []) as ArduinoLog[]);
      setLoading(false);
    };

    load();
    return () => { isMounted = false; };
  }, []);

  const analysis = useMemo(() => analyzeLogs(logs), [logs]);

  const findNearbyTherapy = () => {
    setNearbyError(null);
    setLocationDenied(false);
    setNearbyPlaces([]);
    if (!navigator.geolocation) {
      setNearbyError("Geolocation is not supported by your browser.");
      return;
    }
    setNearbyLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        try {
          const places = await fetchNearbyTherapy(latitude, longitude);
          setNearbyPlaces(places);
          if (places.length === 0) setNearbyError("No physical therapy, occupational therapy, or rehabilitation centers found in OpenStreetMap for this area. Try searching \"physical therapy\" or \"rehabilitation center\" in Google Maps.");
        } catch (e) {
          setNearbyError(e instanceof Error ? e.message : "Failed to load nearby places.");
        } finally {
          setNearbyLoading(false);
        }
      },
      (err) => {
        setNearbyLoading(false);
        if (err.code === err.PERMISSION_DENIED) setLocationDenied(true);
        setNearbyError(err.message || "Could not get your location.");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
    );
  };

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: 320 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ mt: 2 }}>
        {error}
      </Alert>
    );
  }

  if (!analysis) {
    return (
      <Stack spacing={3}>
        <Alert severity="info">
          No tremor data yet. Use the monitor and collect some readings to see personalized suggestions here.
        </Alert>
        <Card variant="outlined">
          <CardHeader
            avatar={<LocationOnIcon color="primary" />}
            title="Find nearby therapy"
            subheader="Physical therapy, occupational therapy, and rehabilitation centers only (within 25 km)"
          />
          <CardContent>
            <Button variant="contained" startIcon={<MapIcon />} onClick={findNearbyTherapy} disabled={nearbyLoading}>
              {nearbyLoading ? "Finding places…" : "Find therapy near me"}
            </Button>
            {locationDenied && (
              <Alert severity="info" sx={{ mt: 2 }}>Location was denied. Enable location for this site in your browser to see nearby places.</Alert>
            )}
            {nearbyError && !locationDenied && (
              <Alert severity="warning" sx={{ mt: 2 }} onClose={() => setNearbyError(null)}>{nearbyError}</Alert>
            )}
            {nearbyPlaces.length > 0 && (
              <List dense sx={{ mt: 2 }}>
                {nearbyPlaces.map((place) => (
                  <ListItem key={place.id} alignItems="flex-start" sx={{ flexDirection: "column", alignItems: "stretch", border: "1px solid", borderColor: "divider", borderRadius: 1, mb: 1, py: 1.5, px: 2 }}>
                    <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={0.5}>
                      <Typography variant="subtitle1" fontWeight={600}>{place.name}</Typography>
                      <Chip size="small" label={`${place.distanceKm.toFixed(1)} km`} variant="outlined" />
                    </Stack>
                    {place.address && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{place.address}</Typography>}
                    <Stack direction="row" alignItems="center" flexWrap="wrap" sx={{ mt: 0.5 }} gap={1}>
                      {place.phone && (
                        <Typography component="a" href={`tel:${place.phone.replace(/\s/g, "")}`} variant="body2" sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}>
                          <PhoneIcon fontSize="small" /> {place.phone}
                        </Typography>
                      )}
                      <IconButton size="small" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.lat + "," + place.lon)}`} target="_blank" rel="noopener noreferrer" aria-label="Open in Google Maps">
                        <MapIcon fontSize="small" />
                      </IconButton>
                    </Stack>
                  </ListItem>
                ))}
              </List>
            )}
            <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 2 }}>
              Data from OpenStreetMap. Distances and details may vary; call before visiting.
            </Typography>
          </CardContent>
        </Card>
      </Stack>
    );
  }

  const { bySeverity, tremorEpisodesPerDay, intenseEpisodesPerDay, peakHours, peakDays, consultTherapist, consultReasons, suggestedTherapies } = analysis;

  return (
    <Stack spacing={3}>
      <Typography variant="h5" sx={{ fontWeight: 600 }}>
        Insights & suggestions
      </Typography>
      <Typography color="text.secondary">
        Based on the last 3 months of tremor data ({analysis.totalReadings} readings).
      </Typography>

      {/* When to consult */}
      <Card variant="outlined">
        <CardHeader
          avatar={<LocalHospitalIcon color="primary" />}
          title="When to consult a therapist or doctor"
        />
        <CardContent>
          {consultTherapist ? (
            <>
              <Alert severity="warning" sx={{ mb: 2 }}>
                We recommend scheduling a consultation with your neurologist or movement disorder specialist.
              </Alert>
              <List dense>
                {consultReasons.map((reason, i) => (
                  <ListItem key={i}>
                    <ListItemIcon sx={{ minWidth: 32 }}>•</ListItemIcon>
                    <ListItemText primary={reason} />
                  </ListItem>
                ))}
              </List>
            </>
          ) : (
            <Typography color="text.secondary">
              Your current patterns do not suggest an urgent need to consult. Continue monitoring; if tremor
              increases or starts affecting daily life, see your doctor.
            </Typography>
          )}
        </CardContent>
      </Card>

      {/* Frequency */}
      <Card variant="outlined">
        <CardHeader
          avatar={<ScheduleIcon color="primary" />}
          title="Tremor frequency"
        />
        <CardContent>
          <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
            <Paper variant="outlined" sx={{ px: 2, py: 1.5 }}>
              <Typography variant="body2" color="text.secondary">Tremor episodes per day (avg)</Typography>
              <Typography variant="h6">{tremorEpisodesPerDay.toFixed(1)}</Typography>
            </Paper>
            <Paper variant="outlined" sx={{ px: 2, py: 1.5 }}>
              <Typography variant="body2" color="text.secondary">Intense episodes per day (avg)</Typography>
              <Typography variant="h6">{intenseEpisodesPerDay.toFixed(1)}</Typography>
            </Paper>
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            Severity breakdown:
          </Typography>
          <Stack direction="row" spacing={1} sx={{ mt: 0.5 }} flexWrap="wrap">
            <Chip label={`No tremor: ${bySeverity["NO TREMOR"]}`} size="small" color="default" />
            <Chip label={`Mild: ${bySeverity["MILD TREMOR"]}`} size="small" color="primary" variant="outlined" />
            <Chip label={`Intense: ${bySeverity["INTENSE TREMOR"]}`} size="small" color="error" variant="outlined" />
          </Stack>
        </CardContent>
      </Card>

      {/* Patterns */}
      <Card variant="outlined">
        <CardHeader
          avatar={<TrendingUpIcon color="primary" />}
          title="Patterns"
        />
        <CardContent>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            Most active by hour (readings)
          </Typography>
          <Stack direction="row" spacing={1} sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
            {peakHours.length ? peakHours.map(({ hour, count, label }) => (
              <Chip key={hour} label={`${label} (${count})`} size="small" variant="outlined" />
            )) : (
              <Typography variant="body2" color="text.secondary">No pattern data yet.</Typography>
            )}
          </Stack>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            Most active by day of week
          </Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            {peakDays.length ? peakDays.map(({ day, count, label }) => (
              <Chip key={day} label={`${label} (${count})`} size="small" variant="outlined" />
            )) : (
              <Typography variant="body2" color="text.secondary">No pattern data yet.</Typography>
            )}
          </Stack>
        </CardContent>
      </Card>

      {/* Suggested therapy */}
      <Card variant="outlined">
        <CardHeader
          avatar={<FitnessCenterIcon color="primary" />}
          title="Suggested therapy & next steps"
        />
        <CardContent>
          <List dense>
            {suggestedTherapies.map((item, i) => (
              <ListItem key={i}>
                <ListItemIcon sx={{ minWidth: 36 }}>
                  <PsychologyIcon fontSize="small" color="action" />
                </ListItemIcon>
                <ListItemText primary={item} />
              </ListItem>
            ))}
          </List>
          <Divider sx={{ my: 2 }} />
          <Typography variant="body2" color="text.secondary">
            These are general suggestions based on your data. Always follow your doctor’s plan and discuss any new
            therapy with them first.
          </Typography>
        </CardContent>
      </Card>

      {/* Find nearby therapy */}
      <Card variant="outlined">
        <CardHeader
          avatar={<LocationOnIcon color="primary" />}
          title="Find nearby therapy"
          subheader="Physical therapy, clinics, and hospitals near you with phone numbers"
        />
        <CardContent>
          <Button
            variant="contained"
            startIcon={<MapIcon />}
            onClick={findNearbyTherapy}
            disabled={nearbyLoading}
          >
            {nearbyLoading ? "Finding places…" : "Find therapy near me"}
          </Button>
          {locationDenied && (
            <Alert severity="info" sx={{ mt: 2 }}>
              Location was denied. Enable location for this site in your browser to see nearby places.
            </Alert>
          )}
          {nearbyError && !locationDenied && (
            <Alert severity="warning" sx={{ mt: 2 }} onClose={() => setNearbyError(null)}>
              {nearbyError}
            </Alert>
          )}
          {nearbyPlaces.length > 0 && (
            <List dense sx={{ mt: 2 }}>
              {nearbyPlaces.map((place) => (
                <ListItem
                  key={place.id}
                  alignItems="flex-start"
                  sx={{ flexDirection: "column", alignItems: "stretch", border: "1px solid", borderColor: "divider", borderRadius: 1, mb: 1, py: 1.5, px: 2 }}
                >
                  <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={0.5}>
                    <Typography variant="subtitle1" fontWeight={600}>
                      {place.name}
                    </Typography>
                    <Chip size="small" label={`${place.distanceKm.toFixed(1)} km`} variant="outlined" />
                  </Stack>
                  {place.address && (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                      {place.address}
                    </Typography>
                  )}
                  <Stack direction="row" alignItems="center" flexWrap="wrap" sx={{ mt: 0.5 }} gap={1}>
                    {place.phone && (
                      <Typography
                        component="a"
                        href={`tel:${place.phone.replace(/\s/g, "")}`}
                        variant="body2"
                        sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}
                      >
                        <PhoneIcon fontSize="small" /> {place.phone}
                      </Typography>
                    )}
                    <IconButton
                      size="small"
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.lat + "," + place.lon)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Open in Google Maps"
                    >
                      <MapIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                </ListItem>
              ))}
            </List>
          )}
          <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 2 }}>
            Only PT, OT, and rehab centers are shown (no dental, pharmacy, or general clinics). Data from OpenStreetMap; call before visiting.
          </Typography>
        </CardContent>
      </Card>
    </Stack>
  );
}
