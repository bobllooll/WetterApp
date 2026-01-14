// Mapping der WMO Wetter-Codes zu deutschem Text
// Open-Meteo nutzt WMO Codes: https://open-meteo.com/en/docs
const weatherCodes = {
    0: 'Klarer Himmel',
    1: 'Überwiegend klar',
    2: 'Teilweise bewölkt',
    3: 'Bedeckt',
    45: 'Nebel',
    48: 'Nebel mit Reif',
    51: 'Leichter Nieselregen',
    53: 'Mäßiger Nieselregen',
    55: 'Dichter Nieselregen',
    61: 'Leichter Regen',
    63: 'Mäßiger Regen',
    65: 'Starker Regen',
    71: 'Leichter Schneefall',
    73: 'Mäßiger Schneefall',
    75: 'Starker Schneefall',
    80: 'Leichte Regenschauer',
    81: 'Mäßige Regenschauer',
    82: 'Heftige Regenschauer',
    95: 'Gewitter',
    96: 'Gewitter mit leichtem Hagel',
    99: 'Gewitter mit starkem Hagel'
};

// Globaler Status für Simulationen
let currentWeatherData = {
    code: 0,
    isDay: 1,
    temp: 0,
    wind: 0,
    moonPhase: 0.5, // Standard: Vollmond
    sunrise: null,
    sunset: null
};

function getLocation() {
    const statusElement = document.getElementById('location-status');
    const errorElement = document.getElementById('error-msg');
    const weatherDataElement = document.getElementById('weather-data');
    const forecastElement = document.getElementById('forecast');
    const hourlyElement = document.getElementById('hourly-forecast');

    // UI zurücksetzen
    statusElement.textContent = "Standort wird ermittelt...";
    errorElement.classList.add('hidden');
    weatherDataElement.classList.add('hidden');
    forecastElement.classList.add('hidden');
    hourlyElement.classList.add('hidden');

    if (!navigator.geolocation) {
        showError("Geolocation wird von diesem Browser nicht unterstützt.");
        return;
    }

    navigator.geolocation.getCurrentPosition(
        (position) => {
            const latitude = position.coords.latitude;
            const longitude = position.coords.longitude;
            statusElement.textContent = "Wetterdaten werden geladen...";
            fetchWeather(latitude, longitude);
        },
        (error) => {
            let msg = "Standortzugriff verweigert.";
            if(error.code === error.TIMEOUT) msg = "Zeitüberschreitung bei der Standortabfrage.";
            showError(msg);
            statusElement.textContent = "Standort unbekannt";
        }
    );
}

async function fetchWeather(lat, lon) {
    try {
        // API Anfrage an Open-Meteo
        const response = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&hourly=temperature_2m,weathercode&daily=weathercode,temperature_2m_max,temperature_2m_min,sunrise,sunset&timezone=auto`
        );
        
        if (!response.ok) throw new Error("Wetterdaten konnten nicht geladen werden.");

        const data = await response.json();
        updateUI(data.current_weather);
        updateHourlyForecastUI(data.hourly);
        updateForecastUI(data.daily);
        
        // Daten speichern für Simulation
        currentWeatherData.code = data.current_weather.weathercode;
        currentWeatherData.isDay = data.current_weather.is_day;
        currentWeatherData.temp = data.current_weather.temperature;
        currentWeatherData.wind = data.current_weather.windspeed;
        // Mondphase von heute (0 bis 1) berechnen
        currentWeatherData.moonPhase = calculateMoonPhase(new Date());
        // Sonnenzeiten speichern
        currentWeatherData.sunrise = data.daily.sunrise[0];
        currentWeatherData.sunset = data.daily.sunset[0];

        setTheme(data.current_weather.weathercode, data.current_weather.is_day, currentWeatherData.moonPhase, currentWeatherData.sunrise, currentWeatherData.sunset);
        
        fetchLocationName(lat, lon);

    } catch (error) {
        showError(error.message);
    }
}

async function fetchLocationName(lat, lon) {
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`);
        const data = await response.json();
        const address = data.address;
        // Priorisierung: Stadt -> Kleinstadt -> Dorf -> Gemeinde
        const city = address.city || address.town || address.village || address.municipality || "Unbekannter Ort";
        document.getElementById('location-status').textContent = city;
    } catch (error) {
        // Fallback auf Koordinaten, falls der Ort nicht ermittelt werden kann
        document.getElementById('location-status').textContent = `Koord: ${lat.toFixed(2)}, ${lon.toFixed(2)}`;
    }
}

function updateUI(weather) {
    const weatherDataElement = document.getElementById('weather-data');
    const tempElement = document.getElementById('temperature');
    const iconElement = document.getElementById('weather-icon');
    const windElement = document.getElementById('wind');
    const descElement = document.getElementById('description');
    const bladesElement = document.getElementById('windmill-blades') || document.querySelector('.blades');

    // Temperatur runden
    tempElement.textContent = Math.round(weather.temperature);
    
    // Windgeschwindigkeit
    windElement.textContent = `${weather.windspeed} km/h`;

    // Windrad Geschwindigkeit anpassen (je schneller der Wind, desto kleiner die Duration)
    // Basis: 20km/h = 2s Rotation. Mindestens 0.2s (sehr schnell), maximal 10s (sehr langsam)
    let duration = 40 / (weather.windspeed || 1); 
    if (duration < 0.2) duration = 0.2;
    if (duration > 10) duration = 10;
    if (bladesElement) bladesElement.style.animationDuration = `${duration}s`;

    // Wetterbeschreibung aus dem Code-Mapping holen
    const code = weather.weathercode;
    const description = weatherCodes[code] || "Unbekanntes Wetter";
    descElement.textContent = description;

    // Icon setzen
    const iconClass = getIconClass(code);
    iconElement.innerHTML = `<i class="${iconClass}"></i>`;

    // Elemente anzeigen
    weatherDataElement.classList.remove('hidden');
}

function updateHourlyForecastUI(hourly) {
    const container = document.getElementById('hourly-forecast');
    container.innerHTML = '';

    // 1. Start-Index finden (nächste volle Stunde oder aktuell)
    const nowTime = Date.now();
    let startIndex = hourly.time.findIndex(t => new Date(t).getTime() >= nowTime);
    if (startIndex === -1) startIndex = 0;
    if (startIndex > 0) startIndex--; // Damit wir die aktuelle Stunde inkludieren

    // 2. Daten filtern: 3-Stunden Schritte, 8 Punkte (24h)
    const steps = 8; 
    const interval = 3;
    const chartData = [];

    for (let i = 0; i < steps; i++) {
        const index = startIndex + (i * interval);
        if (index >= hourly.time.length) break;
        
        chartData.push({
            time: new Date(hourly.time[index]),
            temp: hourly.temperature_2m[index],
            code: hourly.weathercode[index]
        });
    }

    if (chartData.length === 0) return;

    // 3. Min/Max für Skalierung berechnen
    const temps = chartData.map(d => d.temp);
    const minTemp = Math.min(...temps);
    const maxTemp = Math.max(...temps);
    const range = maxTemp - minTemp || 1; // Division durch 0 verhindern

    // 4. Layout Konstanten
    const itemWidth = 70; // Breite pro 3h-Block
    const totalHeight = 160;
    const graphTop = 70; // Platz oben für Zeit & Icon
    const graphHeight = 60; // Höhe der Kurve
    const totalWidth = chartData.length * itemWidth;

    // Wrapper erstellen
    const wrapper = document.createElement('div');
    wrapper.className = 'chart-wrapper';
    wrapper.style.width = `${totalWidth}px`;
    wrapper.style.height = `${totalHeight}px`;

    // SVG erstellen
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("width", totalWidth);
    svg.setAttribute("height", totalHeight);
    svg.style.position = "absolute";
    svg.style.top = "0";
    svg.style.left = "0";

    let pathD = "";
    
    chartData.forEach((d, i) => {
        const x = i * itemWidth + (itemWidth / 2);
        
        // Y-Position berechnen (Invertiert: Max Temp = Oben)
        const normalized = (d.temp - minTemp) / range;
        const y = graphTop + graphHeight - (normalized * graphHeight);

        // Pfad bauen
        if (i === 0) pathD += `M ${x} ${y}`;
        else pathD += ` L ${x} ${y}`;

        // Punkt auf der Linie
        const circle = document.createElementNS(svgNS, "circle");
        circle.setAttribute("cx", x);
        circle.setAttribute("cy", y);
        circle.setAttribute("r", 3);
        circle.setAttribute("fill", "white");
        svg.appendChild(circle);

        // Temperatur Text
        const text = document.createElementNS(svgNS, "text");
        text.setAttribute("x", x);
        text.setAttribute("y", y - 10);
        text.setAttribute("text-anchor", "middle");
        text.setAttribute("fill", "white");
        text.setAttribute("font-size", "13px");
        text.setAttribute("font-weight", "bold");
        text.textContent = `${Math.round(d.temp)}°`;
        svg.appendChild(text);

        // HTML Labels (Zeit & Icon)
        const timeDiv = document.createElement('div');
        timeDiv.className = 'chart-label time';
        timeDiv.textContent = d.time.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
        timeDiv.style.left = `${x}px`;
        timeDiv.style.top = "10px";
        wrapper.appendChild(timeDiv);

        const iconDiv = document.createElement('div');
        iconDiv.className = 'chart-label icon';
        iconDiv.innerHTML = `<i class="${getIconClass(d.code)}"></i>`;
        iconDiv.style.left = `${x}px`;
        iconDiv.style.top = "30px";
        wrapper.appendChild(iconDiv);
    });

    // Linie zeichnen
    const path = document.createElementNS(svgNS, "path");
    path.setAttribute("d", pathD);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "rgba(255,255,255,0.6)");
    path.setAttribute("stroke-width", "2");
    svg.prepend(path); // Hinter die Punkte/Texte legen

    wrapper.appendChild(svg);
    container.appendChild(wrapper);
    container.classList.remove('hidden');
}

function updateForecastUI(daily) {
    const forecastContainer = document.getElementById('forecast');
    forecastContainer.innerHTML = '';

    // Nächste 5 Tage anzeigen (Index 1 bis 5, da 0 heute ist)
    for(let i = 1; i <= 5; i++) {
        const date = new Date(daily.time[i]);
        const dayName = date.toLocaleDateString('de-DE', { weekday: 'short' });
        const maxTemp = Math.round(daily.temperature_2m_max[i]);
        const minTemp = Math.round(daily.temperature_2m_min[i]);
        const iconClass = getIconClass(daily.weathercode[i]);

        const item = document.createElement('div');
        item.className = 'forecast-item';
        item.innerHTML = `
            <div class="forecast-day">${dayName}</div>
            <div class="forecast-icon"><i class="${iconClass}"></i></div>
            <div>${maxTemp}° / ${minTemp}°</div>
        `;
        forecastContainer.appendChild(item);
    }
    forecastContainer.classList.remove('hidden');
}

function getIconClass(code) {
    // Mapping basierend auf WMO Codes
    if (code === 0) return 'fa-solid fa-sun';
    if (code >= 1 && code <= 3) return 'fa-solid fa-cloud-sun';
    if (code >= 45 && code <= 48) return 'fa-solid fa-smog';
    if (code >= 51 && code <= 67) return 'fa-solid fa-cloud-rain';
    if (code >= 71 && code <= 77) return 'fa-solid fa-snowflake';
    if (code >= 80 && code <= 82) return 'fa-solid fa-cloud-showers-heavy';
    if (code >= 95 && code <= 99) return 'fa-solid fa-bolt';
    return 'fa-solid fa-cloud';
}

function setTheme(code, isDay, moonPhase = 0.5, sunriseStr = null, sunsetStr = null) {
    const body = document.body;
    const particles = document.getElementById('particles');
    const celestial = document.getElementById('celestial-container');
    const city = document.getElementById('city-scape');
    
    // Reset Klassen, Partikel und Himmelskörper
    body.className = '';
    particles.innerHTML = '';
    celestial.innerHTML = '';

    // Sichtbarkeit berechnen (bei schlechtem Wetter weniger sichtbar)
    let celestialOpacity = 1;
    let celestialBlur = 0;

    // Leicht bewölkt / Nebel
    if (code >= 1 && code <= 3) { celestialOpacity = 0.8; celestialBlur = 2; }
    if (code === 45 || code === 48) { celestialOpacity = 0.5; celestialBlur = 5; }
    // Regen / Schnee
    if ((code >= 51 && code <= 67) || (code >= 80 && code <= 86) || (code >= 71 && code <= 77)) {
        celestialOpacity = 0.4; 
        celestialBlur = 4;
    }
    // Gewitter / Sturm
    if (code >= 95) { celestialOpacity = 0.2; celestialBlur = 8; }

    celestial.style.opacity = celestialOpacity;
    celestial.style.filter = `blur(${celestialBlur}px)`;

    // 1. Tag / Nacht Basis-Logik
    if (isDay === 0) {
        body.classList.add('theme-night');
        const moonChar = getMoonPhaseIcon(moonPhase);
        celestial.innerHTML = `<div class="moon">${moonChar}</div>`;
        if(city) city.classList.add('lights-on');
    } else {
        body.classList.add('theme-sunny');
        
        // Sonnenposition berechnen (Bogenlaufbahn)
        let sunStyle = '';
        if (sunriseStr && sunsetStr) {
            const now = new Date();
            const sunrise = new Date(sunriseStr);
            const sunset = new Date(sunsetStr);
            const totalDay = sunset - sunrise;
            const elapsed = now - sunrise;
            
            // Prozent des Tages (0.0 bis 1.0)
            let progress = elapsed / totalDay;
            if (progress < 0) progress = 0;
            if (progress > 1) progress = 1;

            // Position berechnen: Left 10-90%, Bottom 20-80% (Sinus-Kurve)
            const leftPos = 10 + (80 * progress);
            const bottomPos = 20 + (60 * Math.sin(progress * Math.PI));
            sunStyle = `style="left: ${leftPos}%; bottom: ${bottomPos}%; top: auto; right: auto;"`;
        }
        
        celestial.innerHTML = `<div class="sun" ${sunStyle}></div>`;
        if(city) city.classList.remove('lights-on');
    }

    // Morgenrot / Abendrot Check
    if (sunriseStr && sunsetStr) {
        const now = new Date();
        const sunrise = new Date(sunriseStr);
        const sunset = new Date(sunsetStr);
        const oneHour = 60 * 60 * 1000; // 1 Stunde in Millisekunden

        // Wenn wir innerhalb von 1 Stunde um Sonnenaufgang sind
        if (Math.abs(now - sunrise) < oneHour) body.classList.add('theme-dawn');
        
        // Wenn wir innerhalb von 1 Stunde um Sonnenuntergang sind
        if (Math.abs(now - sunset) < oneHour) body.classList.add('theme-dusk');
    }

    // Kälte-Check für Rauch (unter 10 Grad)
    if (currentWeatherData.temp <= 10) {
        body.classList.add('theme-cold');
    }

    // Windig Check (ab 20 km/h)
    if (currentWeatherData.wind > 20) {
        body.classList.add('theme-windy');
    }

    // 2. Spezifische Wetter-Overrides
    // Wolken (Codes 1, 2, 3, 45, 48)
    if (code >= 1 && code <= 3) {
        body.classList.add('theme-cloudy');
        createClouds(5);
    }
    
    // Nebel (Codes 45, 48)
    if (code === 45 || code === 48) {
        body.classList.add('theme-fog');
        createFog(4);
    }

    // Regen (Codes 51-67, 80-82)
    if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) {
        body.classList.add('theme-rain');
        createRain(100);
        if(city) city.classList.add('rain-mode');
    }

    // Schnee (Codes 71-77, 85-86)
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) {
        body.classList.add('theme-snow');
        createSnow(60);
        if(city) city.classList.add('snow-mode');
    }

    // Gewitter (Codes 95-99)
    if (code >= 95 && code <= 99) {
        body.classList.add('theme-storm');
        createRain(100); // Regen dazu
        if(city) city.classList.add('storm-mode', 'rain-mode');
        const flash = document.createElement('div');
        flash.className = 'flash';
        particles.appendChild(flash);
    }

    // Sterne hinzufügen, wenn es Nacht ist und nicht komplett bedeckt/neblig
    if (isDay === 0 && code < 3) {
        createStars(50);
        createShootingStars(); // Sternschnuppen nur bei klarem Nachthimmel
    }
}

function calculateMoonPhase(date) {
    const synodic = 29.53058867;
    const msPerDay = 86400000;
    const baseDate = new Date('2000-01-06T18:14:00Z'); // Bekannter Neumond
    const diff = date.getTime() - baseDate.getTime();
    let phase = (diff / (synodic * msPerDay)) % 1;
    if (phase < 0) phase += 1;
    return phase;
}

function getMoonPhaseIcon(phase) {
    // Open-Meteo: 0.0 = Neumond, 0.5 = Vollmond, 1.0 = Neumond
    // Mapping auf Unicode Charaktere
    if (phase === 0 || phase === 1) return '🌑';
    if (phase < 0.25) return '🌒';
    if (phase === 0.25) return '🌓';
    if (phase < 0.5) return '🌔';
    if (phase === 0.5) return '🌕';
    if (phase < 0.75) return '🌖';
    if (phase === 0.75) return '🌗';
    return '🌘';
}

// --- TEST FUNKTIONEN ---
let testIndex = 0;
const testScenariosData = [
    { name: "Sonnig", code: 0, is_day: 1, temp: 25, wind: 10 },
    { name: "Nacht Klar", code: 0, is_day: 0, temp: 12, wind: 5 },
    { name: "Regen", code: 63, is_day: 1, temp: 15, wind: 25 },
    { name: "Gewitter", code: 95, is_day: 0, temp: 18, wind: 65 },
    { name: "Schnee", code: 73, is_day: 1, temp: -2, wind: 15 },
    { name: "Nebel", code: 45, is_day: 1, temp: 8, wind: 2 },
    { name: "Abendrot", code: 0, is_day: 1, temp: 20, wind: 5, forceDusk: true }
];

function testScenarios() {
    const scenario = testScenariosData[testIndex];
    
    // Mock Current Weather Data
    const mockWeather = {
        temperature: scenario.temp,
        windspeed: scenario.wind,
        weathercode: scenario.code,
        is_day: scenario.is_day
    };

    // Mock Forecast Data (einfach 5 Tage generieren)
    const mockDaily = {
        time: ["2023-01-01", "2023-01-02", "2023-01-03", "2023-01-04", "2023-01-05", "2023-01-06"],
        weathercode: [scenario.code, scenario.code, 0, 63, 71, 95],
        temperature_2m_max: [scenario.temp + 2, scenario.temp + 1, 20, 15, 0, 25],
        temperature_2m_min: [scenario.temp - 5, scenario.temp - 4, 10, 10, -5, 15]
    };

    // Mock Hourly Data (24h ab jetzt)
    const mockHourly = {
        time: [],
        temperature_2m: [],
        weathercode: []
    };
    for(let i=0; i<48; i++) { // Genug Daten für "heute" + Puffer
        const d = new Date(); d.setHours(i, 0, 0, 0);
        mockHourly.time.push(d.toISOString());
        mockHourly.temperature_2m.push(scenario.temp + Math.sin(i/5)*3); // Leichte Kurve
        mockHourly.weathercode.push(scenario.code);
    }

    currentWeatherData.code = scenario.code;
    currentWeatherData.isDay = scenario.is_day;
    currentWeatherData.temp = scenario.temp;
    currentWeatherData.wind = scenario.wind;
    // Im Testmodus einfach Vollmond annehmen oder zufällig
    currentWeatherData.moonPhase = 0.5; 
    
    // Mock Zeiten für Abendrot Test
    let mockSunrise = null;
    let mockSunset = null;
    if (scenario.forceDusk) {
        mockSunset = new Date().toISOString(); // Setzt Sonnenuntergang auf "Jetzt"
    }

    updateUI(mockWeather);
    updateHourlyForecastUI(mockHourly);
    updateForecastUI(mockDaily);
    setTheme(scenario.code, scenario.is_day, 0.5, mockSunrise, mockSunset);
    
    document.getElementById('location-status').textContent = `Test: ${scenario.name}`;

    // Index erhöhen oder zurücksetzen
    testIndex = (testIndex + 1) % testScenariosData.length;
}

function forceDay() {
    currentWeatherData.isDay = 1;
    setTheme(currentWeatherData.code, 1, currentWeatherData.moonPhase, currentWeatherData.sunrise, currentWeatherData.sunset);
    document.getElementById('location-status').textContent += " (Tag Sim)";
}

function forceNight() {
    currentWeatherData.isDay = 0;
    setTheme(currentWeatherData.code, 0, currentWeatherData.moonPhase, currentWeatherData.sunrise, currentWeatherData.sunset);
    document.getElementById('location-status').textContent += " (Nacht Sim)";
}

// Hilfsfunktionen für Partikel
function createRain(amount) {
    const container = document.getElementById('particles');
    for(let i=0; i<amount; i++) {
        const drop = document.createElement('div');
        drop.className = 'rain-drop';
        drop.style.left = Math.random() * 100 + 'vw';
        
        // Regen ist schnell: 0.4s bis 0.7s
        drop.style.animationDuration = (Math.random() * 0.3 + 0.4) + 's';
        // Negative Delay sorgt dafür, dass der Regen sofort da ist (kein "Einschalten")
        drop.style.animationDelay = -Math.random() * 2 + 's';
        // Unterschiedliche Längen für Tiefe (10px bis 30px)
        drop.style.height = (Math.random() * 20 + 10) + 'px';
        drop.style.opacity = Math.random() * 0.3 + 0.2; // Subtiler
        
        container.appendChild(drop);
    }
}

function createSnow(amount) {
    const container = document.getElementById('particles');
    for(let i=0; i<amount; i++) {
        const flake = document.createElement('div');
        flake.className = 'snowflake';
        flake.style.left = Math.random() * 100 + 'vw';
        
        // Parallaxe-Effekt: Größe und Geschwindigkeit koppeln
        // Große Flocken (nah) fallen schneller, kleine (fern) langsamer
        const depth = Math.random(); // 0 bis 1
        const size = (depth * 4) + 2; // 2px bis 6px
        const duration = (15 - depth * 5); // 10s bis 15s
        
        flake.style.width = `${size}px`;
        flake.style.height = `${size}px`;
        flake.style.animationDuration = `${duration}s`;
        flake.style.animationDelay = -Math.random() * 10 + 's'; // Sofort starten
        
        // Unschärfe für entfernte Flocken (kleine Flocken)
        if (size < 3.5) {
            flake.style.filter = `blur(1px)`;
            flake.style.opacity = 0.6;
        } else {
            flake.style.opacity = 0.9;
        }
        
        container.appendChild(flake);
    }
}

function createStars(amount) {
    const container = document.getElementById('particles');
    for(let i=0; i<amount; i++) {
        const star = document.createElement('div');
        star.className = 'star';
        star.style.left = Math.random() * 100 + 'vw';
        star.style.top = Math.random() * 100 + 'vh';
        star.style.width = star.style.height = (Math.random() * 2 + 1) + 'px';
        star.style.animationDelay = Math.random() * 2 + 's';
        container.appendChild(star);
    }
}

function createShootingStars() {
    const container = document.getElementById('particles');
    // Eine Sternschnuppe, die ab und zu vorbeifliegt
    const star = document.createElement('div');
    star.className = 'shooting-star';
    star.style.top = (Math.random() * 30) + 'vh';
    star.style.left = (Math.random() * 50 + 50) + 'vw';
    star.style.animationDelay = Math.random() * 5 + 's';
    container.appendChild(star);
}

function createClouds(amount) {
    const container = document.getElementById('particles');
    for(let i=0; i<amount; i++) {
        const cloud = document.createElement('div');
        cloud.className = 'cloud-shape';
        cloud.style.width = (Math.random() * 200 + 100) + 'px';
        cloud.style.height = (Math.random() * 100 + 50) + 'px';
        cloud.style.top = (Math.random() * 50) + 'vh';
        cloud.style.animationDuration = (Math.random() * 20 + 20) + 's';
        cloud.style.opacity = Math.random() * 0.3 + 0.1;
        container.appendChild(cloud);
    }
}

function createFog(amount) {
    const container = document.getElementById('particles');
    for(let i=0; i<amount; i++) {
        const fog = document.createElement('div');
        fog.className = 'fog-shape';
        fog.style.top = (Math.random() * 80 + 10) + 'vh'; // Verteilt über die Höhe
        fog.style.height = (Math.random() * 100 + 50) + 'px';
        fog.style.animationDuration = (Math.random() * 20 + 20) + 's'; // Sehr langsam
        fog.style.animationDelay = (Math.random() * 10) + 's';
        container.appendChild(fog);
    }
}

function showError(message) {
    const errorElement = document.getElementById('error-msg');
    errorElement.textContent = message;
    errorElement.classList.remove('hidden');
}

// Funktion zum Erstellen der modernen Häuser-Siedlung
function createCityScape() {
    const city = document.getElementById('city-scape');
    if (!city) return;
    city.innerHTML = '';

    // 1. Berg im Hintergrund (Kleiner & Ästhetischer)
    const mountain = document.createElement('div');
    mountain.className = 'mountain';
    const mountainSnow = document.createElement('div');
    mountainSnow.className = 'mountain-snow'; // Moderne, flächige Animation
    mountain.appendChild(mountainSnow);
    city.appendChild(mountain);

    // Container für Gebäude und Lampen (Ebene hinter der Straße)
    const buildingsLayer = document.createElement('div');
    buildingsLayer.className = 'buildings-layer';
    city.appendChild(buildingsLayer);

    // Konfiguration für Häuser
    const configs = [
        { type: 'gable', width: 70, height: 60, color: '#FFD166' }, // Pastell Gelb
        { type: 'flat', width: 85, height: 50, color: '#EF476F' },  // Pastell Rot/Pink
        { type: 'slant', width: 60, height: 70, color: '#118AB2' }, // Pastell Blau
        { type: 'gable', width: 75, height: 65, color: '#06D6A0' }, // Pastell Grün
        { type: 'flat', width: 80, height: 55, color: '#8D99AE' }   // Pastell Grau
    ];

    // Wir mischen Lampen zwischen die Häuser
    configs.forEach((conf, index) => {
        // Ab und zu eine Straßenlaterne vor dem Haus
        if (index % 2 === 0) {
            const lamp = document.createElement('div');
            lamp.className = 'street-lamp';
            const light = document.createElement('div');
            light.className = 'lamp-light';
            // Neuer Lichtkegel
            const cone = document.createElement('div');
            cone.className = 'light-cone';
            lamp.appendChild(cone);
            lamp.appendChild(light);
            buildingsLayer.appendChild(lamp);
        }

        // Das Haus
        const house = document.createElement('div');
        house.className = `house ${conf.type}`;
        house.style.setProperty('--h-width', `${conf.width}px`);
        house.style.setProperty('--h-height', `${conf.height}px`);
        house.style.setProperty('--h-color', conf.color);

        // Schornstein (Chimney)
        const chimney = document.createElement('div');
        chimney.className = 'chimney';
        // Rauch Partikel
        for(let k=0; k<3; k++) {
             const smoke = document.createElement('div');
             smoke.className = 'smoke';
             smoke.style.animationDelay = `${k * 1.5}s`; // Versetzt starten
             chimney.appendChild(smoke);
        }
        house.appendChild(chimney);

        // Dach Bereich
        const roof = document.createElement('div');
        roof.className = 'roof';
        
        house.appendChild(roof);

        // Haus Körper
        const body = document.createElement('div');
        body.className = 'house-body';
        
        // Fenster (Rund/Eckig je nach Stil via CSS)
        const win = document.createElement('div');
        win.className = 'window';
        body.appendChild(win);

        // Tür
        const door = document.createElement('div');
        door.className = 'door';
        body.appendChild(door);

        house.appendChild(body);
        buildingsLayer.appendChild(house);
    });

    // 2. Die Straße (Vordergrund)
    const street = document.createElement('div');
    street.className = 'street';
    city.appendChild(street);

    // Mobile Check für weniger/kleinere Pfützen
    const isMobile = window.innerWidth < 600;
    const puddleCount = isMobile ? 5 : 8;
    const snowCount = isMobile ? 6 : 10;

    // Mehrere Pfützen, die mit der Zeit entstehen
    for(let i = 0; i < puddleCount; i++) {
        const puddle = document.createElement('div');
        puddle.className = 'puddle';
        
        // Zufällige Position auf der Straße
        const randomLeft = Math.random() * 90 + 5; // 5% bis 95% (breiter verteilt)
        puddle.style.left = `${randomLeft}%`;
        
        // Größe anpassen (kleiner auf Mobile)
        const size = isMobile ? (Math.random() * 20 + 20) : (Math.random() * 40 + 30);
        puddle.style.width = `${size}px`; 
        
        // Zufällige vertikale Position auf der Straße (damit sie nicht alle auf einer Linie sind)
        puddle.style.top = `${Math.random() * 60 + 20}%`; // 20% bis 80% Höhe
        
        // Zufällige Verzögerung für das Entstehen ("mit der Zeit")
        puddle.style.transitionDelay = `${Math.random() * 2}s`; 
        
        street.appendChild(puddle);
    }

    // Schneefelder (ähnlich wie Pfützen, aber für Schnee)
    for(let i = 0; i < snowCount; i++) {
        const snowPatch = document.createElement('div');
        snowPatch.className = 'snow-patch';
        
        // Zufällige Position und Größe
        snowPatch.style.left = `${Math.random() * 90 + 5}%`;
        snowPatch.style.width = `${Math.random() * 50 + 20}px`;
        
        const size = isMobile ? (Math.random() * 30 + 15) : (Math.random() * 50 + 20);
        snowPatch.style.width = `${size}px`;

        snowPatch.style.top = `${Math.random() * 70 + 10}%`; // Auf der Straße verteilt
        snowPatch.style.transitionDelay = `${Math.random() * 10}s`; // Sehr unterschiedliche Startzeiten
        street.appendChild(snowPatch);
    }
}

// Automatisch beim Laden starten
window.onload = () => {
    createCityScape();
    createDataSourceHint();
    getLocation();
};

// Hinweis zur Datenquelle erstellen
function createDataSourceHint() {
    const hint = document.createElement('div');
    hint.className = 'data-source';
    hint.innerHTML = 'Wetterdaten von <a href="https://open-meteo.com/" target="_blank">Open-Meteo.com</a>';
    document.body.appendChild(hint);
}