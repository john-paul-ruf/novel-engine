I want to set daily and weekly word count goals and see my progress against them. Show me a streak counter — how many consecutive days I've hit my target. Writers are motivated by accountability, and NaNoWriMo proved that a simple word count tracker changes behavior.

The goal should be configurable per book (different books move at different speeds) with a default in settings. Progress should be calculated from actual chapter word count changes — the file_versions table already has timestamps and byte sizes, so detecting "words written today" should be straightforward by comparing the latest snapshot to the snapshot from midnight.

Show the goal progress as a small bar or badge somewhere always-visible — maybe in the sidebar header or the title bar. A quick glance should tell me "you've written 800 of your 1500-word daily goal." Don't make it annoying or gamified — just clean, factual, always there.
