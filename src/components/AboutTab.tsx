export function AboutTab() {
  return (
    <div className="card">
      <h2>How the estimate is built</h2>
      <h3>1. Mid-sleep on free days, corrected for sleep debt (MSFsc)</h3>
      <p>
        From the Munich ChronoType Questionnaire (Roenneberg, Wirz-Justice &amp; Merrow 2003; Roenneberg et al. 2015). Nights you woke without an alarm are "free days"; the others are
        "workdays". Mid-sleep on free days (MSF) is shifted earlier by half the extra sleep you get on free days relative to your weekly average, because that extra sleep is debt
        repayment, not chronotype. This is the best-validated questionnaire marker of phase and correlates with measured DLMO at roughly r ≈ 0.7.
      </p>
      <h3>2. DLMO ≈ MSFsc − 7 h</h3>
      <p>
        Dim-light melatonin onset is the gold-standard phase marker and needs saliva assays. Studies comparing MCTQ with DLMO (Kantermann, Sung &amp; Burgess 2015) find the two track
        each other with an average interval near 7 h, but individual residuals are commonly ±1.5–2 h. The app draws that uncertainty as a halo and never reports better than "moderate"
        confidence for anything derived from it.
      </p>
      <h3>3. Core body temperature minimum (CBTmin)</h3>
      <p>
        Taken as 2.5 h before average natural wake (typical range 2–3 h), or as the time of the smoothed overnight heart-rate nadir if a heart-rate series has been imported. Heart
        rate follows temperature at night but is also moved by posture, arousals and sleep stage, so it is a noisy proxy. The first hour after onset is skipped because the initial
        heart-rate drop at sleep onset is a sleep effect, not a circadian one.
      </p>
      <h3>4. Misalignment and inertia</h3>
      <p>
        The headline gap is required wake vs. estimated natural wake. Inertia severity rises when the alarm falls before CBTmin (alertness trough), within two hours after it, inside
        the first three hours of sleep (slow-wave dominated), or before the melatonin window ends.
      </p>
      <h3>5. Phase response curves</h3>
      <p>
        Light before CBTmin delays the clock; light after it advances it (Khalsa et al. 2003; Minors, Waterhouse &amp; Wirz-Justice 1991). Melatonin taken several hours before DLMO
        advances; taken after CBTmin it delays (Lewy et al. 1998; Burgess et al. 2008, 2010). The app only turns these into clock-time windows anchored on its estimates; it does not
        advise on dose or on whether to use melatonin at all.
      </p>
      <h3>Data</h3>
      <p>
        Everything is stored in this browser's IndexedDB. There is no account and no server for the manual path. The optional WHOOP path needs a tiny relay to hold the OAuth client
        secret (see <code>relay/README.md</code>); tokens are stored only in this browser.
      </p>
    </div>
  );
}
