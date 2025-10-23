#!/bin/bash
# Script to generate load for testing the monitoring dashboard

echo "Container Stress Test Script"
echo "============================"
echo ""

# Function to generate CPU load
cpu_stress() {
    echo "Generating CPU load..."
    for i in {1..4}; do
        dd if=/dev/zero of=/dev/null bs=1M &
    done

    echo "CPU stress started (PIDs: $!)"
    echo "Press Ctrl+C to stop"
    wait
}

# Function to generate memory load
memory_stress() {
    echo "Generating memory load..."
    stress-ng --vm 2 --vm-bytes 75% --timeout 60s
}

# Function to generate disk I/O load
disk_stress() {
    echo "Generating disk I/O load..."
    stress-ng --hdd 2 --timeout 60s
}

# Function to spawn multiple processes
process_stress() {
    echo "Spawning multiple processes..."
    for i in {1..20}; do
        sleep 1000 &
    done
    echo "Spawned 20 sleep processes"
    echo "PIDs: $(jobs -p)"
    wait
}

# Menu
echo "Select stress test type:"
echo "1) CPU stress"
echo "2) Memory stress (requires stress-ng)"
echo "3) Disk I/O stress (requires stress-ng)"
echo "4) Process spawn stress"
echo "5) Combined stress (CPU + Processes)"
echo ""
read -p "Enter choice [1-5]: " choice

case $choice in
    1)
        cpu_stress
        ;;
    2)
        memory_stress
        ;;
    3)
        disk_stress
        ;;
    4)
        process_stress
        ;;
    5)
        echo "Starting combined stress test..."
        cpu_stress &
        CPU_PID=$!
        process_stress &
        PROC_PID=$!

        trap "kill $CPU_PID $PROC_PID 2>/dev/null; killall dd sleep 2>/dev/null" EXIT
        wait
        ;;
    *)
        echo "Invalid choice"
        exit 1
        ;;
esac
